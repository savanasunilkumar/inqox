from datetime import UTC, datetime, timedelta
from email.utils import format_datetime

import httpx
import pytest

from applyit_ingestion.config import Settings
from applyit_ingestion.outbox import Delivery, OutboxWorker, _retry_after_seconds


class FakePool:
    def __init__(self) -> None:
        self.calls = []

    async def execute(self, query, *args):
        self.calls.append((query, args))
        return "UPDATE 1"


def delivery(*, attempts: int = 1, max_attempts: int = 8) -> Delivery:
    return Delivery(
        id=7,
        provider="ntfy",
        endpoint_config={"base_url": "https://ntfy.example", "topic": "private-topic"},
        payload={
            "company": "Example",
            "title": "Software Engineer",
            "location": "Remote",
            "canonical_url": "https://example.com/jobs/1",
        },
        attempts=attempts,
        max_attempts=max_attempts,
    )


def test_retry_after_numeric_seconds() -> None:
    assert _retry_after_seconds("30") == 30


def test_retry_after_http_date() -> None:
    future = datetime.now(UTC) + timedelta(seconds=30)
    delay = _retry_after_seconds(format_datetime(future))
    assert delay is not None
    assert 20 <= delay <= 31


def test_invalid_retry_after_is_ignored() -> None:
    assert _retry_after_seconds("not-a-date") is None


@pytest.mark.asyncio
async def test_success_is_marked_delivered_only_with_provider_id(monkeypatch) -> None:
    monkeypatch.setenv("NTFY_TOPIC", "private-topic")
    pool = FakePool()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"id": "ntfy-message-1"}, request=request)
    )
    worker = OutboxWorker(pool, Settings.from_env(), transport=transport)

    result = await worker.deliver(delivery())

    assert result == {"id": 7, "status": "delivered", "provider_id": "ntfy-message-1"}
    assert "status = 'delivered'" in pool.calls[-1][0]


@pytest.mark.asyncio
async def test_429_remains_pending_and_honors_retry_after(monkeypatch) -> None:
    monkeypatch.setenv("NTFY_TOPIC", "private-topic")
    pool = FakePool()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(
            429, headers={"Retry-After": "12"}, text="slow down", request=request
        )
    )
    worker = OutboxWorker(pool, Settings.from_env(), transport=transport)

    result = await worker.deliver(delivery())

    assert result["status"] == "retry"
    assert "status = 'pending'" in pool.calls[-1][0]
    assert pool.calls[-1][1][1] == 12


@pytest.mark.asyncio
async def test_permanent_4xx_is_dead(monkeypatch) -> None:
    monkeypatch.setenv("NTFY_TOPIC", "private-topic")
    pool = FakePool()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(403, text="forbidden", request=request)
    )
    worker = OutboxWorker(pool, Settings.from_env(), transport=transport)

    result = await worker.deliver(delivery())

    assert result["status"] == "dead"
    assert "status = 'dead'" in pool.calls[-1][0]


@pytest.mark.asyncio
async def test_retry_exhaustion_preserves_dead_row(monkeypatch) -> None:
    monkeypatch.setenv("NTFY_TOPIC", "private-topic")
    pool = FakePool()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(503, text="unavailable", request=request)
    )
    worker = OutboxWorker(pool, Settings.from_env(), transport=transport)

    result = await worker.deliver(delivery(attempts=8, max_attempts=8))

    assert result["status"] == "dead"
    assert "status = 'dead'" in pool.calls[-1][0]


@pytest.mark.asyncio
async def test_non_object_success_json_is_retried_instead_of_crashing(monkeypatch) -> None:
    monkeypatch.setenv("NTFY_TOPIC", "private-topic")
    pool = FakePool()
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json=["not", "an", "object"], request=request)
    )
    worker = OutboxWorker(pool, Settings.from_env(), transport=transport)

    result = await worker.deliver(delivery())

    assert result["status"] == "retry"
    assert "unexpected JSON payload" in result["error"]
    assert "status = 'pending'" in pool.calls[-1][0]
