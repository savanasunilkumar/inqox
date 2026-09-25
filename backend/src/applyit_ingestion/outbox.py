from __future__ import annotations

import asyncio
import logging
import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote

import asyncpg
import httpx

from .config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Delivery:
    id: int
    provider: str
    endpoint_config: dict[str, Any]
    payload: dict[str, Any]
    attempts: int
    max_attempts: int


class OutboxWorker:
    def __init__(
        self,
        pool: asyncpg.Pool,
        settings: Settings,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.pool = pool
        self.settings = settings
        self.transport = transport
        self.worker_id = f"notifier-{uuid.uuid4().hex[:12]}"

    async def claim(self) -> Delivery | None:
        async with self.pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                UPDATE notification_outbox SET status = 'dead', locked_by = NULL,
                  locked_until = NULL,
                  last_error = COALESCE(last_error, 'delivery attempts exhausted')
                WHERE attempts >= max_attempts
                  AND status IN ('pending', 'processing')
                  AND (status = 'pending' OR locked_until < now())
                """
            )
            row = await connection.fetchrow(
                """
                WITH picked AS (
                  SELECT id FROM notification_outbox
                  WHERE (status = 'pending' AND available_at <= now())
                     OR (status = 'processing' AND locked_until < now())
                  ORDER BY available_at, id
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                UPDATE notification_outbox o SET
                  status = 'processing', locked_by = $1,
                  locked_until = now() + interval '2 minutes',
                  attempts = attempts + 1
                FROM picked
                WHERE o.id = picked.id
                RETURNING o.*
                """,
                self.worker_id,
            )
            if row is None:
                return None
            endpoint = await connection.fetchrow(
                "SELECT provider, config, enabled FROM notification_endpoints WHERE id = $1",
                row["endpoint_id"],
            )
            if endpoint is None or not endpoint["enabled"]:
                await connection.execute(
                    """
                    UPDATE notification_outbox SET status = 'dead', locked_by = NULL,
                      locked_until = NULL, last_error = 'endpoint is missing or disabled'
                    WHERE id = $1
                    """,
                    row["id"],
                )
                return None
            return Delivery(
                id=row["id"],
                provider=endpoint["provider"],
                endpoint_config=dict(endpoint["config"] or {}),
                payload=dict(row["payload"] or {}),
                attempts=row["attempts"],
                max_attempts=row["max_attempts"],
            )

    async def deliver(self, delivery: Delivery) -> dict[str, Any]:
        try:
            if delivery.provider != "ntfy":
                raise PermanentDeliveryError(f"unsupported provider: {delivery.provider}")
            provider_id = await self._send_ntfy(delivery)
        except PermanentDeliveryError as exc:
            await self._mark_dead(delivery, str(exc))
            return {"id": delivery.id, "status": "dead", "error": str(exc)}
        except RetryableDeliveryError as exc:
            status = await self._retry_or_dead(delivery, str(exc), exc.retry_after_seconds)
            return {"id": delivery.id, "status": status, "error": str(exc)}
        except (httpx.HTTPError, OSError, ValueError, TypeError, AttributeError) as exc:
            status = await self._retry_or_dead(delivery, str(exc), None)
            return {"id": delivery.id, "status": status, "error": str(exc)}

        await self.pool.execute(
            """
            UPDATE notification_outbox SET status = 'delivered', delivered_at = now(),
              provider_message_id = $2, locked_by = NULL, locked_until = NULL,
              last_error = NULL
            WHERE id = $1 AND status = 'processing' AND locked_by = $3
            """,
            delivery.id,
            provider_id,
            self.worker_id,
        )
        return {"id": delivery.id, "status": "delivered", "provider_id": provider_id}

    async def _send_ntfy(self, delivery: Delivery) -> str:
        base_url = str(delivery.endpoint_config.get("base_url") or self.settings.ntfy_base_url)
        topic = str(delivery.endpoint_config.get("topic") or self.settings.ntfy_topic or "")
        if not topic:
            raise PermanentDeliveryError("ntfy topic is not configured")
        payload = delivery.payload
        company = str(payload.get("company") or "Unknown company")
        title = str(payload.get("title") or "New job")
        location = str(payload.get("location") or "").strip()
        url = str(payload.get("canonical_url") or "")
        lines = [title[:500]]
        if location:
            lines.append(location[:500])
        if url:
            lines.append(url[:1500])
        body = "\n".join(lines).encode("utf-8")[:3900].decode("utf-8", errors="ignore")
        headers = {
            "Title": f"New job at {company}"[:256],
            "Priority": "3",
            "Tags": "briefcase",
            "Content-Type": "text/plain; charset=utf-8",
        }
        if url:
            headers["Click"] = url
        if self.settings.ntfy_token:
            headers["Authorization"] = f"Bearer {self.settings.ntfy_token}"
        endpoint = f"{base_url.rstrip('/')}/{quote(topic, safe='')}"
        async with httpx.AsyncClient(
            timeout=20, follow_redirects=False, transport=self.transport
        ) as client:
            response = await client.post(endpoint, headers=headers, content=body)
        if response.status_code in {408, 429} or response.status_code >= 500:
            raise RetryableDeliveryError(
                f"ntfy returned HTTP {response.status_code}",
                _retry_after_seconds(response.headers.get("Retry-After")),
            )
        if not response.is_success:
            raise PermanentDeliveryError(f"ntfy returned HTTP {response.status_code}")
        try:
            response_payload = response.json()
        except ValueError as exc:
            raise RetryableDeliveryError("ntfy returned invalid JSON") from exc
        if not isinstance(response_payload, dict):
            raise RetryableDeliveryError("ntfy returned an unexpected JSON payload")
        message_id = response_payload.get("id")
        if not message_id:
            raise RetryableDeliveryError("ntfy accepted the request without a message id")
        return str(message_id)

    async def _retry_or_dead(
        self, delivery: Delivery, error: str, retry_after_seconds: float | None
    ) -> str:
        if delivery.attempts >= delivery.max_attempts:
            await self._mark_dead(delivery, error)
            return "dead"
        delay = retry_after_seconds
        if delay is None:
            cap = min(3600.0, 5.0 * (2 ** max(delivery.attempts - 1, 0)))
            delay = random.uniform(0.0, cap)
        await self.pool.execute(
            """
            UPDATE notification_outbox SET status = 'pending',
              available_at = now() + make_interval(secs => $2),
              locked_by = NULL, locked_until = NULL, last_error = $3
            WHERE id = $1 AND status = 'processing' AND locked_by = $4
            """,
            delivery.id,
            max(delay, 1.0),
            error[:4000],
            self.worker_id,
        )
        return "retry"

    async def _mark_dead(self, delivery: Delivery, error: str) -> None:
        await self.pool.execute(
            """
            UPDATE notification_outbox SET status = 'dead', locked_by = NULL,
              locked_until = NULL, last_error = $2
            WHERE id = $1 AND status = 'processing' AND locked_by = $3
            """,
            delivery.id,
            error[:4000],
            self.worker_id,
        )

    async def run_once(self):
        delivery = await self.claim()
        if delivery is None:
            return None
        result = await self.deliver(delivery)
        log.info("delivery %s", result)
        return result

    async def run_forever(self) -> None:
        while True:
            result = await self.run_once()
            if result is None:
                await asyncio.sleep(self.settings.notifier_idle_seconds)


class RetryableDeliveryError(RuntimeError):
    def __init__(self, message: str, retry_after_seconds: float | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class PermanentDeliveryError(RuntimeError):
    pass


def _retry_after_seconds(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(float(value), 0.0)
    except ValueError:
        pass
    try:
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return max((parsed - datetime.now(UTC)).total_seconds(), 0.0)
    except (TypeError, ValueError, OverflowError):
        return None
