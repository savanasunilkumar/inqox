from __future__ import annotations

import hashlib
import os
from dataclasses import replace

import httpx
import pytest

asyncpg = pytest.importorskip("asyncpg")

from applyit_ingestion.config import Settings
from applyit_ingestion.db import Database
from applyit_ingestion.models import NormalizedJob, ScanResult
from applyit_ingestion.registry import import_hosted_registry
from applyit_ingestion.repository import Repository

pytestmark = pytest.mark.asyncio


def make_job(job_id: str, title: str = "Software Engineer") -> NormalizedJob:
    return NormalizedJob(
        external_id=job_id,
        title=title,
        location="Remote",
        canonical_url=f"https://example.com/jobs/{job_id}",
    )


@pytest.fixture
async def repository(tmp_path, monkeypatch):
    dsn = os.getenv("TEST_DATABASE_URL")
    if not dsn:
        pytest.skip("TEST_DATABASE_URL is not set")
    monkeypatch.setenv("DATABASE_URL", dsn)
    monkeypatch.setenv("NTFY_TOPIC", "integration-test-topic")
    database = Database(dsn)
    await database.connect()
    await database.migrate()
    pool = database.require_pool()
    await pool.execute(
        """
        TRUNCATE notification_outbox, notification_endpoints, job_versions, jobs,
                 scan_runs, job_sources, source_rate_limit_leases,
                 source_rate_limits, companies RESTART IDENTITY CASCADE
        """
    )
    csv_path = tmp_path / "sources.csv"
    csv_path.write_text(
        "name,domain,adapter,identifier,careers_url,scan_interval_seconds,closure_safe\n"
        "Example,example.com,ashby,example,https://jobs.ashbyhq.com/example,600,true\n",
        encoding="utf-8",
    )
    repo = Repository(pool, Settings.from_env())
    await repo.bootstrap_sources(csv_path, activate=True)
    await pool.execute("UPDATE source_rate_limits SET min_spacing_ms = 0")
    yield repo
    await database.close()


async def apply(repo: Repository, jobs: list[NormalizedJob], *, complete: bool = True):
    claim = await repo.claim_scan(1)
    assert claim is not None
    return await repo.apply_scan(
        claim,
        ScanResult(tuple(jobs), complete=complete, expected_count=len(jobs)),
    )


async def test_silent_baseline_atomic_outbox_and_two_miss_closure(repository: Repository) -> None:
    baseline = await apply(repository, [make_job("a"), make_job("b")])
    assert baseline.status == "succeeded"
    assert baseline.baseline is True
    assert await repository.pool.fetchval("SELECT count(*) FROM jobs") == 2
    assert await repository.pool.fetchval("SELECT count(*) FROM notification_outbox") == 0
    initial_feed = await repository.feed(200)
    assert len(initial_feed["items"]) == 2
    initial_cursor = initial_feed["nextCursor"]
    assert initial_cursor is not None

    second = await apply(repository, [make_job("a"), make_job("b"), make_job("c")])
    assert second.discovered == 1
    assert second.matched == 1
    assert await repository.pool.fetchval("SELECT count(*) FROM notification_outbox") == 1
    feed = await repository.feed(200, initial_cursor)
    assert feed["hasMore"] is False
    assert len(feed["items"]) == 1
    assert feed["nextCursor"] is not None
    assert set(feed["items"][0]) == {
        "id",
        "company",
        "domain",
        "title",
        "location",
        "url",
        "published",
        "foundAt",
    }

    after = await repository.feed(200, feed["nextCursor"])
    assert after == {
        "items": [],
        "nextCursor": feed["nextCursor"],
        "hasMore": False,
    }

    excluded = make_job("d", "Software Engineer Intern")
    first_miss = await apply(repository, [make_job("b"), make_job("c"), excluded])
    assert first_miss.closed == 0
    assert (
        await repository.pool.fetchval(
            "SELECT missing_full_scans FROM jobs WHERE external_job_id = 'a'"
        )
        == 1
    )
    assert await repository.pool.fetchval("SELECT count(*) FROM notification_outbox") == 1

    second_miss = await apply(repository, [make_job("b"), make_job("c"), excluded])
    assert second_miss.closed == 1
    state = await repository.pool.fetchval(
        "SELECT lifecycle_state FROM jobs WHERE external_job_id = 'a'"
    )
    assert state == "closed"


async def test_unchanged_jobs_refresh_last_seen_and_raw_in_one_scan(
    repository: Repository,
) -> None:
    initial = [replace(make_job("a"), raw={"revision": 1}), make_job("b")]
    await apply(repository, initial)
    first_scan_id = await repository.pool.fetchval(
        "SELECT last_seen_scan_id FROM jobs WHERE external_job_id = 'a'"
    )

    summary = await apply(
        repository,
        [replace(make_job("a"), raw={"revision": 2}), make_job("b")],
    )

    assert summary.unchanged == 2
    row = await repository.pool.fetchrow(
        "SELECT last_seen_scan_id, raw FROM jobs WHERE external_job_id = 'a'"
    )
    assert row["last_seen_scan_id"] != first_scan_id
    assert row["raw"] == {"revision": 2}
    assert await repository.pool.fetchval("SELECT count(*) FROM job_versions") == 2


async def test_empty_baseline_does_not_swallow_first_real_job(repository: Repository) -> None:
    baseline = await apply(repository, [])
    assert baseline.baseline is True

    discovered = await apply(repository, [make_job("first")])
    assert discovered.baseline is False
    assert discovered.discovered == 1
    assert discovered.matched == 1
    assert await repository.pool.fetchval("SELECT count(*) FROM notification_outbox") == 1


async def test_incomplete_snapshot_is_quarantined_without_mutation(repository: Repository) -> None:
    await apply(repository, [make_job("a")])
    summary = await apply(repository, [make_job("new")], complete=False)

    assert summary.status == "quarantined"
    assert (
        await repository.pool.fetchval("SELECT count(*) FROM jobs WHERE external_job_id = 'new'")
        == 0
    )
    assert (
        await repository.pool.fetchval(
            "SELECT lifecycle_state FROM jobs WHERE external_job_id = 'a'"
        )
        == "open"
    )


async def test_expired_scan_cannot_apply_or_clear_replacement_lease(
    repository: Repository,
) -> None:
    await apply(repository, [make_job("baseline")])
    old_claim = await repository.claim_scan(1)
    assert old_claim is not None
    await repository.pool.execute(
        "UPDATE job_sources SET lease_until = now() - interval '1 second' WHERE id = 1"
    )
    await repository.pool.execute(
        "UPDATE source_rate_limit_leases SET expires_at = now() - interval '1 second' "
        "WHERE lease_token = $1",
        old_claim.source.lease_token,
    )

    replacement = await repository.claim_scan(1)
    assert replacement is not None
    superseded = await repository.apply_scan(
        old_claim,
        ScanResult((make_job("must-not-appear"),), complete=True, expected_count=1),
    )

    assert superseded.status == "superseded"
    assert (
        await repository.pool.fetchval(
            "SELECT count(*) FROM jobs WHERE external_job_id = 'must-not-appear'"
        )
        == 0
    )
    assert (
        await repository.pool.fetchval("SELECT lease_token FROM job_sources WHERE id = 1")
        == replacement.source.lease_token
    )


async def test_shared_adapter_rate_limit_allows_bounded_concurrent_claims(
    repository: Repository, tmp_path
) -> None:
    second_csv = tmp_path / "second-source.csv"
    second_csv.write_text(
        "name,domain,adapter,identifier,careers_url,scan_interval_seconds,closure_safe\n"
        "Second,second.example,ashby,second,https://jobs.ashbyhq.com/second,600,true\n",
        encoding="utf-8",
    )
    await repository.bootstrap_sources(second_csv, activate=True)
    await repository.pool.execute("UPDATE source_rate_limits SET min_spacing_ms = 0")

    first = await repository.claim_scan(1)
    second = await repository.claim_scan(2)

    assert first is not None
    assert second is not None
    assert first.source.rate_limit_key == second.source.rate_limit_key == "adapter:ashby"
    assert (
        await repository.pool.fetchval(
            "SELECT count(*) FROM source_rate_limit_leases WHERE rate_limit_key = 'adapter:ashby'"
        )
        == 2
    )


async def test_cursor_feed_pages_forward_without_dropping_events(repository: Repository) -> None:
    await apply(repository, [make_job("baseline")])
    await apply(repository, [make_job("baseline"), make_job("first")])
    checkpoint = await repository.feed(10)
    cursor = checkpoint["nextCursor"]
    assert cursor is not None

    await apply(
        repository,
        [make_job("baseline"), make_job("first"), make_job("second"), make_job("third")],
    )
    page_one = await repository.feed(1, cursor)
    assert page_one["hasMore"] is True
    assert len(page_one["items"]) == 1

    page_two = await repository.feed(1, page_one["nextCursor"])
    assert page_two["hasMore"] is False
    assert len(page_two["items"]) == 1
    assert {page_one["items"][0]["title"], page_two["items"][0]["title"]} == {"Software Engineer"}
    assert page_one["items"][0]["id"] != page_two["items"][0]["id"]


async def test_job_board_lists_filters_and_hides_closed_jobs(repository: Repository) -> None:
    onsite = NormalizedJob(
        external_id="onsite",
        title="Senior Platform Engineer",
        location="Chicago, IL",
        canonical_url="https://example.com/jobs/onsite",
        apply_url="https://example.com/apply/onsite",
        description_text="Build reliable systems.",
        employment_type="Full-time",
        is_remote=False,
    )
    remote = NormalizedJob(
        external_id="remote",
        title="Frontend Developer",
        location="United States",
        canonical_url="https://example.com/jobs/remote",
        is_remote=True,
    )
    unknown = NormalizedJob(
        external_id="unknown",
        title="Data Analyst",
        location=None,
        canonical_url="https://example.com/jobs/unknown",
        is_remote=None,
    )
    await apply(repository, [onsite, remote, unknown])

    first = await repository.list_jobs(1)
    assert first["hasMore"] is True
    assert first["nextCursor"] == first["items"][0]["id"]
    second = await repository.list_jobs(1, before=first["nextCursor"])
    third = await repository.list_jobs(1, before=second["nextCursor"])
    assert [page["items"][0]["title"] for page in (first, second, third)] == [
        "Data Analyst",
        "Frontend Developer",
        "Senior Platform Engineer",
    ]
    assert third["hasMore"] is False
    assert third["nextCursor"] is None

    matches = await repository.list_jobs(q="platform", company="EXAMPLE", location="chicago")
    assert [item["title"] for item in matches["items"]] == ["Senior Platform Engineer"]
    assert [item["title"] for item in (await repository.list_jobs(remote=True))["items"]] == [
        "Frontend Developer"
    ]
    assert [item["title"] for item in (await repository.list_jobs(remote=False))["items"]] == [
        "Senior Platform Engineer"
    ]
    assert (await repository.list_jobs(q="%"))["items"] == []

    onsite_id = matches["items"][0]["id"]
    assert matches["items"][0] == {
        "id": onsite_id,
        "title": "Senior Platform Engineer",
        "company": "Example",
        "domain": "example.com",
        "location": "Chicago, IL",
        "url": "https://example.com/jobs/onsite",
        "applyUrl": "https://example.com/apply/onsite",
        "publishedAt": None,
        "firstSeenAt": matches["items"][0]["firstSeenAt"],
        "employmentType": "Full-time",
        "isRemote": False,
        "sourceKey": "ashby:example",
    }
    detail = await repository.get_job(onsite_id)
    assert detail == {**matches["items"][0], "descriptionText": "Build reliable systems."}

    await repository.pool.execute("UPDATE job_sources SET status = 'paused' WHERE id = 1")
    assert (await repository.list_jobs())["items"] == []
    assert await repository.get_job(onsite_id) is None
    await repository.pool.execute("UPDATE job_sources SET status = 'active' WHERE id = 1")

    await apply(repository, [remote, unknown])
    await apply(repository, [remote, unknown])
    assert (await repository.list_jobs(q="platform"))["items"] == []
    assert await repository.get_job(onsite_id) is None


async def test_discoveries_only_source_never_closes_missing_jobs(repository: Repository) -> None:
    await repository.pool.execute(
        "UPDATE job_sources SET config = config || '{\"closure_safe\": false}'::jsonb WHERE id = 1"
    )
    await apply(repository, [make_job("still-open")])
    await apply(repository, [])
    await apply(repository, [])

    assert (
        await repository.pool.fetchval(
            "SELECT lifecycle_state FROM jobs WHERE external_job_id = 'still-open'"
        )
        == "open"
    )


async def test_registry_bulk_import_is_idempotent_and_workday_is_discoveries_only(
    repository: Repository,
) -> None:
    csv_body = (
        b"ats,name,slug,url\n"
        b"ashby,Registry Ashby,registry-ashby,https://jobs.ashbyhq.com/registry-ashby\n"
        b"workday,Registry Workday,tenant/Site,https://tenant.wd5.myworkdayjobs.com/Site\n"
    )
    digest = hashlib.sha256(csv_body).hexdigest()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("manifest.json"):
            return httpx.Response(
                200,
                json={
                    "companies": {
                        "csv": "https://registry.example/companies.csv",
                        "sha256": digest,
                        "rows": 2,
                    }
                },
                request=request,
            )
        return httpx.Response(200, content=csv_body, request=request)

    transport = httpx.MockTransport(handler)
    first = await import_hosted_registry(
        repository.pool,
        "https://registry.example/manifest.json",
        transport=transport,
    )
    second = await import_hosted_registry(
        repository.pool,
        "https://registry.example/manifest.json",
        transport=transport,
    )

    assert first.inserted == 2
    assert second.inserted == 0
    assert second.existing == 2
    rows = await repository.pool.fetch(
        "SELECT adapter, status, config->>'closure_safe' AS closure_safe "
        "FROM job_sources WHERE origin = 'ats-scrapers-hosted-registry' ORDER BY adapter"
    )
    assert [(row["adapter"], row["status"], row["closure_safe"]) for row in rows] == [
        ("ashby", "candidate", "false"),
        ("workday", "candidate", "false"),
    ]
