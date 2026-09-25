from __future__ import annotations

import asyncio
import json
import logging
import time

from .adapters import scan_source
from .config import Settings
from .repository import ClaimedScan, Repository

log = logging.getLogger(__name__)


class ScanLeaseLostError(RuntimeError):
    pass


async def scan_with_lease(repository: Repository, settings: Settings, claim: ClaimedScan):
    async def heartbeat() -> None:
        interval = max(1.0, min(settings.source_lease_seconds / 3, 60.0))
        while True:
            await asyncio.sleep(interval)
            if not await repository.renew_scan_lease(claim):
                raise ScanLeaseLostError("scan lost its source lease")

    scan_task = asyncio.create_task(scan_source(claim.source, settings))
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        done, _ = await asyncio.wait(
            {scan_task, heartbeat_task}, return_when=asyncio.FIRST_COMPLETED
        )
        if scan_task in done:
            return await scan_task
        scan_task.cancel()
        await asyncio.gather(scan_task, return_exceptions=True)
        return await heartbeat_task
    finally:
        for task in (scan_task, heartbeat_task):
            if not task.done():
                task.cancel()
        await asyncio.gather(scan_task, heartbeat_task, return_exceptions=True)


async def scan_once(
    repository: Repository,
    settings: Settings,
    source_id: int | None = None,
    *,
    timeout_seconds: float | None = None,
):
    # The timeout covers claim, provider fetch, and reconciliation. In a batch,
    # callers pass the smaller of the source cap and the remaining run budget.
    timeout = min(
        settings.source_scan_timeout_seconds,
        timeout_seconds if timeout_seconds is not None else settings.source_scan_timeout_seconds,
    )
    if timeout <= 0:
        raise ValueError("source scan timeout must be positive")
    claim: ClaimedScan | None = None
    try:
        async with asyncio.timeout(timeout):
            claim = await repository.claim_scan(source_id)
            if claim is None:
                return None
            result = await scan_with_lease(repository, settings, claim)
            summary = await repository.apply_scan(claim, result)
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        if claim is None:
            raise
        await repository.fail_scan(claim, exc)
        log.exception("scan failed for %s", claim.source.source_key)
        return {
            "scan_id": claim.scan_id,
            "source": claim.source.source_key,
            "status": "failed",
            "error": str(exc),
        }
    output = {"source": claim.source.source_key, **summary.to_dict()}
    log.info("scan %s", json.dumps(output, default=str, sort_keys=True))
    return output


async def scanner_worker(repository: Repository, settings: Settings) -> None:
    while True:
        result = await scan_once(repository, settings)
        if result is None:
            await asyncio.sleep(settings.scanner_idle_seconds)


async def scan_batch(
    repository: Repository,
    settings: Settings,
    *,
    max_sources: int,
    max_seconds: int,
    concurrency: int,
) -> dict[str, int | float]:
    """Drain due sources with bounded concurrency, then exit for a batch platform."""

    started = time.monotonic()
    deadline = started + max_seconds
    # Keep time for a timed-out scan to roll back and record failure before the
    # Cloud Run Job's outer timeout (currently 3600s) ends the process.
    cleanup_reserve = min(90.0, max(1.0, max_seconds * 0.1))
    lock = asyncio.Lock()
    completed = 0
    active = 0
    succeeded = 0
    failed = 0
    quarantined = 0
    superseded = 0

    async def worker() -> None:
        nonlocal completed, active, succeeded, failed, quarantined, superseded
        idle_rounds = 0
        while True:
            remaining = deadline - time.monotonic() - cleanup_reserve
            if remaining <= 0:
                return
            async with lock:
                if completed + active >= max_sources:
                    return
                active += 1
            try:
                result = await scan_once(
                    repository, settings, timeout_seconds=remaining
                )
            finally:
                async with lock:
                    active -= 1
            if result is None:
                idle_rounds += 1
                if idle_rounds >= 3:
                    return
                await asyncio.sleep(min(settings.scanner_idle_seconds, 2))
                continue

            idle_rounds = 0
            status = str(result.get("status") or "succeeded")
            async with lock:
                completed += 1
                if status == "failed":
                    failed += 1
                elif status == "quarantined":
                    quarantined += 1
                elif status == "superseded":
                    superseded += 1
                else:
                    succeeded += 1

    await asyncio.gather(*(worker() for _ in range(concurrency)))
    return {
        "completed": completed,
        "succeeded": succeeded,
        "failed": failed,
        "quarantined": quarantined,
        "superseded": superseded,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
