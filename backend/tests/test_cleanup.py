from __future__ import annotations

from contextlib import asynccontextmanager

import pytest

from applyit_ingestion.cleanup import SANDBOX_SOURCE_KEY, prune_sandbox_candidate

pytestmark = pytest.mark.asyncio


def candidate_row(**changes):
    row = {
        "id": 41,
        "source_key": SANDBOX_SOURCE_KEY,
        "status": "candidate",
        "origin": "ats-scrapers-hosted-registry",
        "company_id": 9,
        "baseline_completed_at": None,
        "verified_at": None,
        "lease_token": None,
        "lease_until": None,
        "last_job_count": None,
        "company": "Example Corp Sandbox",
        "domain": None,
        "registry_key": SANDBOX_SOURCE_KEY,
        "jobs": 0,
        "scans": 0,
        "reviews": 0,
        "attempts": 0,
        "other_company_sources": 0,
    }
    row.update(changes)
    return row


class FakeConnection:
    def __init__(self, row):
        self.row = row
        self.commands = []

    @asynccontextmanager
    async def transaction(self):
        yield self

    async def fetchrow(self, query, source_key):
        assert source_key == SANDBOX_SOURCE_KEY
        return self.row

    async def execute(self, query, *args):
        self.commands.append((query, args))
        return "DELETE 1"


class FakePool:
    def __init__(self, row):
        self.connection = FakeConnection(row)

    @asynccontextmanager
    async def acquire(self):
        yield self.connection


async def test_cleanup_defaults_to_read_only_dry_run() -> None:
    pool = FakePool(candidate_row())
    result = await prune_sandbox_candidate(pool)

    assert result["status"] == "ready"
    assert result["mode"] == "dry_run"
    assert result["eligible"] is True
    assert pool.connection.commands == []


@pytest.mark.parametrize(
    "change",
    [
        {"status": "active"},
        {"origin": "manual-reviewed"},
        {"registry_key": "greenhouse:other"},
        {"domain": "example.com"},
        {"baseline_completed_at": "previous"},
        {"verified_at": "previous"},
        {"lease_token": "active-lease"},
        {"last_job_count": 0},
        {"jobs": 1},
        {"scans": 1},
        {"reviews": 1},
        {"attempts": 1},
        {"other_company_sources": 1},
    ],
)
async def test_cleanup_refuses_any_nonempty_or_used_candidate(change) -> None:
    pool = FakePool(candidate_row(**change))

    with pytest.raises(RuntimeError, match="cleanup refused"):
        await prune_sandbox_candidate(pool, execute=True)
    assert pool.connection.commands == []


async def test_execute_deletes_only_named_source_and_orphan_company() -> None:
    pool = FakePool(candidate_row())
    result = await prune_sandbox_candidate(pool, execute=True)

    assert result["status"] == "deleted"
    assert len(pool.connection.commands) == 2
    assert pool.connection.commands[0][1] == (41, SANDBOX_SOURCE_KEY)
    assert pool.connection.commands[1][1] == (9, SANDBOX_SOURCE_KEY)
