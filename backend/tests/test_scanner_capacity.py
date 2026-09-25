from __future__ import annotations

import asyncio
import time
from dataclasses import replace
from types import SimpleNamespace

import pytest

from applyit_ingestion import scanner
from applyit_ingestion.config import Settings
from applyit_ingestion.repository import ClaimedScan

pytestmark = pytest.mark.asyncio


class FakeRepository:
    def __init__(self) -> None:
        self.claims = 0
        self.failed: list[Exception] = []

    async def claim_scan(self, source_id: int | None = None):
        self.claims += 1
        if self.claims > 1:
            return None
        source = SimpleNamespace(id=1, source_key="test:one")
        return ClaimedScan(scan_id=1, scan_seq=1, source=source)

    async def fail_scan(self, claim: ClaimedScan, exc: Exception) -> None:
        self.failed.append(exc)

    async def renew_scan_lease(self, claim: ClaimedScan) -> bool:
        return True

    async def apply_scan(self, claim: ClaimedScan, result):
        raise AssertionError("timed out scan must not be applied")


async def slow_fetch(source, settings):
    await asyncio.sleep(10)


async def test_source_timeout_records_failure(monkeypatch) -> None:
    monkeypatch.setattr(scanner, "scan_source", slow_fetch)
    repository = FakeRepository()
    settings = replace(Settings.from_env(), source_scan_timeout_seconds=0.03)

    result = await scanner.scan_once(repository, settings)

    assert result is not None
    assert result["status"] == "failed"
    assert len(repository.failed) == 1
    assert isinstance(repository.failed[0], TimeoutError)


async def test_batch_does_not_wait_for_late_source_past_run_budget(monkeypatch) -> None:
    monkeypatch.setattr(scanner, "scan_source", slow_fetch)
    repository = FakeRepository()
    settings = replace(Settings.from_env(), source_scan_timeout_seconds=10)
    started = time.monotonic()

    summary = await scanner.scan_batch(
        repository, settings, max_sources=10, max_seconds=2, concurrency=1
    )

    assert summary["completed"] == 1
    assert summary["failed"] == 1
    assert len(repository.failed) == 1
    assert time.monotonic() - started < 2
