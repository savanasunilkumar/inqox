from __future__ import annotations

import csv
import hashlib
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import asyncpg

from .config import Settings
from .job_signals import SENIORITY_LABELS, SIGNALS_VERSION, JobSignals
from .matching import WatchMatcher
from .models import NormalizedJob, ReconcileSummary, ScanResult, Source
from .source_keys import make_source_key


@dataclass(frozen=True, slots=True)
class ClaimedScan:
    scan_id: int
    scan_seq: int
    source: Source


def make_rate_limit_key(adapter: str, identifier: str, careers_url: str | None) -> str:
    adapter = adapter.strip().casefold()
    candidate = identifier if identifier.startswith(("http://", "https://")) else careers_url
    hostname = urlsplit(candidate).hostname if candidate else None
    # Workday and Recruitee use tenant-specific hosts. Most other adapters use
    # one shared API origin, so adapter-wide serialization is the polite bound.
    if hostname and adapter in {"workday", "recruitee", "successfactors", "taleo", "icims"}:
        return f"host:{hostname.casefold()}"
    return f"adapter:{adapter}"


def rate_limit_policy(adapter: str) -> tuple[int, int]:
    """Return `(minimum spacing milliseconds, max concurrent scans)`."""
    adapter = adapter.strip().casefold()
    return {
        "ashby": (150, 6),
        "greenhouse": (100, 8),
        "lever": (150, 6),
        "recruitee": (250, 3),
        "rippling": (500, 2),
        "smartrecruiters": (150, 6),
        "workday": (250, 2),
    }.get(adapter, (500, 2))


def _source_from_record(row: asyncpg.Record) -> Source:
    config = dict(row["config"] or {})
    return Source(
        id=row["id"],
        company_id=row["company_id"],
        company_name=row["company_name"],
        domain=row["domain"],
        source_key=row["source_key"],
        rate_limit_key=row["rate_limit_key"],
        adapter=row["adapter"],
        identifier=str(config.get("identifier") or row["careers_url"] or ""),
        careers_url=row["careers_url"],
        config=config,
        status=row["status"],
        scan_interval_seconds=row["scan_interval_seconds"],
        baseline_completed_at=row["baseline_completed_at"],
        last_job_count=row["last_job_count"],
        closure_miss_threshold=row["closure_miss_threshold"],
        lease_token=row["lease_token"],
    )


SOURCE_SELECT = """
SELECT s.*, c.name AS company_name, c.domain
FROM job_sources s
JOIN companies c ON c.id = s.company_id
JOIN source_rate_limits rl ON rl.rate_limit_key = s.rate_limit_key
"""


class Repository:
    def __init__(self, pool: asyncpg.Pool, settings: Settings) -> None:
        self.pool = pool
        self.settings = settings
        self.matcher = WatchMatcher(settings.watch_keywords, settings.watch_excludes)

    async def bootstrap_sources(self, csv_path: Path, *, activate: bool) -> int:
        rows = list(csv.DictReader(csv_path.read_text(encoding="utf-8").splitlines()))
        async with self.pool.acquire() as connection, connection.transaction():
            for row in rows:
                name = row["name"].strip()
                domain = row["domain"].strip().casefold() or None
                adapter = row["adapter"].strip().casefold()
                identifier = row["identifier"].strip()
                source_key = make_source_key(adapter, identifier)
                rate_limit_key = make_rate_limit_key(
                    adapter, identifier, row.get("careers_url") or None
                )
                min_spacing_ms, max_concurrency = rate_limit_policy(adapter)
                interval = int(
                    row.get("scan_interval_seconds") or self.settings.default_scan_interval_seconds
                )
                closure_safe = str(row.get("closure_safe") or "false").casefold() in {
                    "1",
                    "true",
                    "yes",
                }
                company_id = None
                if domain:
                    company_id = await connection.fetchval(
                        "SELECT id FROM companies WHERE domain = $1", domain
                    )
                if company_id is None:
                    company_id = await connection.fetchval(
                        "INSERT INTO companies(name, domain) VALUES ($1, $2) RETURNING id",
                        name,
                        domain,
                    )
                else:
                    await connection.execute(
                        "UPDATE companies SET name = $2, updated_at = now() WHERE id = $1",
                        company_id,
                        name,
                    )
                await connection.execute(
                    """
                    INSERT INTO source_rate_limits(
                      rate_limit_key, min_spacing_ms, max_concurrency
                    ) VALUES ($1, $2, $3)
                    ON CONFLICT (rate_limit_key) DO UPDATE SET
                      min_spacing_ms = EXCLUDED.min_spacing_ms,
                      max_concurrency = EXCLUDED.max_concurrency,
                      updated_at = now()
                    """,
                    rate_limit_key,
                    min_spacing_ms,
                    max_concurrency,
                )
                # Older builds lower-cased the whole identifier when creating
                # source_key. Preserve the existing row when upgrading a URL
                # whose path is case-sensitive (notably Workday site names).
                await connection.execute(
                    """
                    UPDATE job_sources existing SET source_key = $3, updated_at = now()
                    WHERE existing.company_id = $1
                      AND existing.adapter = $2
                      AND existing.config->>'identifier' = $4
                      AND existing.source_key <> $3
                      AND NOT EXISTS (
                        SELECT 1 FROM job_sources target WHERE target.source_key = $3
                      )
                    """,
                    company_id,
                    adapter,
                    source_key,
                    identifier,
                )
                await connection.execute(
                    """
                    INSERT INTO job_sources(
                      company_id, source_key, rate_limit_key, adapter, config, careers_url, status,
                      verified_at, origin, scan_interval_seconds
                    ) VALUES (
                      $1, $2, $3, $4, $5, $6,
                      CASE WHEN $7 THEN 'active' ELSE 'candidate' END,
                      CASE WHEN $7 THEN now() ELSE NULL END,
                      'manual-reviewed', $8
                    )
                    ON CONFLICT (source_key) DO UPDATE SET
                      company_id = EXCLUDED.company_id,
                      rate_limit_key = EXCLUDED.rate_limit_key,
                      adapter = EXCLUDED.adapter,
                      config = EXCLUDED.config,
                      careers_url = EXCLUDED.careers_url,
                      status = CASE WHEN $7 THEN 'active' ELSE job_sources.status END,
                      verified_at = CASE WHEN $7 THEN now() ELSE job_sources.verified_at END,
                      verification_error = CASE WHEN $7 THEN NULL ELSE job_sources.verification_error END,
                      scan_interval_seconds = EXCLUDED.scan_interval_seconds,
                      updated_at = now()
                    """,
                    company_id,
                    source_key,
                    rate_limit_key,
                    adapter,
                    {
                        "identifier": identifier,
                        "include_descriptions": True,
                        "closure_safe": closure_safe,
                    },
                    row.get("careers_url") or None,
                    activate,
                    interval,
                )
            if self.settings.ntfy_topic:
                await connection.execute(
                    """
                    INSERT INTO notification_endpoints(name, provider, config)
                    VALUES ('primary-ntfy', 'ntfy', $1)
                    ON CONFLICT (name) DO UPDATE SET
                      provider = EXCLUDED.provider,
                      config = EXCLUDED.config,
                      enabled = true,
                      updated_at = now()
                    """,
                    {
                        "base_url": self.settings.ntfy_base_url,
                        "topic": self.settings.ntfy_topic,
                    },
                )
        return len(rows)

    async def claim_scan(self, source_id: int | None = None) -> ClaimedScan | None:
        lease_token = uuid.uuid4().hex
        async with self.pool.acquire() as connection, connection.transaction():
            await connection.execute(
                "DELETE FROM source_rate_limit_leases WHERE expires_at < now()"
            )
            where = """s.status = 'active'
              AND (s.lease_until IS NULL OR s.lease_until < now())
              AND rl.next_allowed_at <= now()
              AND (
                SELECT count(*) FROM source_rate_limit_leases active_lease
                WHERE active_lease.rate_limit_key = rl.rate_limit_key
              ) < rl.max_concurrency"""
            args: list[Any] = []
            if source_id is None:
                where += " AND s.next_scan_at <= now()"
            else:
                where += " AND s.id = $1"
                args.append(source_id)
            row = await connection.fetchrow(
                SOURCE_SELECT
                + f" WHERE {where} ORDER BY s.next_scan_at, s.id FOR UPDATE OF s, rl SKIP LOCKED LIMIT 1",
                *args,
            )
            if row is None:
                return None
            scan_seq = row["next_scan_seq"] + 1
            await connection.execute(
                """
                UPDATE job_sources SET
                  next_scan_seq = $2,
                  lease_token = $3,
                  lease_until = now() + make_interval(secs => $4),
                  updated_at = now()
                WHERE id = $1
                """,
                row["id"],
                scan_seq,
                lease_token,
                self.settings.source_lease_seconds,
            )
            await connection.execute(
                """
                UPDATE source_rate_limits SET
                  next_allowed_at = now() + (min_spacing_ms * interval '1 millisecond'),
                  updated_at = now()
                WHERE rate_limit_key = $1
                """,
                row["rate_limit_key"],
            )
            await connection.execute(
                """
                INSERT INTO source_rate_limit_leases(lease_token, rate_limit_key, expires_at)
                VALUES ($1, $2, now() + make_interval(secs => $3))
                """,
                lease_token,
                row["rate_limit_key"],
                self.settings.source_lease_seconds,
            )
            request_key = f"source:{row['id']}:scan:{scan_seq}"
            scan_id = await connection.fetchval(
                """
                INSERT INTO scan_runs(source_id, request_key, scan_seq, mode, is_baseline)
                VALUES ($1, $2, $3, 'full', $4)
                RETURNING id
                """,
                row["id"],
                request_key,
                scan_seq,
                row["baseline_completed_at"] is None,
            )
            mutable = dict(row)
            mutable["lease_token"] = lease_token
            return ClaimedScan(scan_id, scan_seq, _source_from_record(mutable))

    async def renew_scan_lease(self, claim: ClaimedScan) -> bool:
        """Extend a source and provider-slot lease only while both are owned."""
        async with self.pool.acquire() as connection, connection.transaction():
            owned = await connection.fetchval(
                """
                SELECT true
                FROM job_sources source
                JOIN source_rate_limit_leases rate_lease
                  ON rate_lease.rate_limit_key = source.rate_limit_key
                 AND rate_lease.lease_token = source.lease_token
                WHERE source.id = $1 AND source.lease_token = $2
                FOR UPDATE OF source, rate_lease
                """,
                claim.source.id,
                claim.source.lease_token,
            )
            if not owned:
                return False
            await connection.execute(
                """
                UPDATE job_sources SET
                  lease_until = now() + make_interval(secs => $3), updated_at = now()
                WHERE id = $1 AND lease_token = $2
                """,
                claim.source.id,
                claim.source.lease_token,
                self.settings.source_lease_seconds,
            )
            await connection.execute(
                """
                UPDATE source_rate_limit_leases SET
                  expires_at = now() + make_interval(secs => $3)
                WHERE rate_limit_key = $1 AND lease_token = $2
                """,
                claim.source.rate_limit_key,
                claim.source.lease_token,
                self.settings.source_lease_seconds,
            )
            return True

    async def claim_verification(self, source_id: int) -> ClaimedScan | None:
        lease_token = uuid.uuid4().hex
        async with self.pool.acquire() as connection, connection.transaction():
            await connection.execute(
                "DELETE FROM source_rate_limit_leases WHERE expires_at < now()"
            )
            row = await connection.fetchrow(
                SOURCE_SELECT
                + """
                  WHERE s.id = $1
                    AND s.status IN ('candidate', 'paused', 'invalid')
                    AND (s.lease_until IS NULL OR s.lease_until < now())
                    AND rl.next_allowed_at <= now()
                    AND (
                      SELECT count(*) FROM source_rate_limit_leases active_lease
                      WHERE active_lease.rate_limit_key = rl.rate_limit_key
                    ) < rl.max_concurrency
                  FOR UPDATE OF s, rl SKIP LOCKED
                """,
                source_id,
            )
            if row is None:
                return None
            scan_seq = row["next_scan_seq"] + 1
            await connection.execute(
                """
                UPDATE job_sources SET next_scan_seq = $2, lease_token = $3,
                  lease_until = now() + make_interval(secs => $4), updated_at = now()
                WHERE id = $1
                """,
                source_id,
                scan_seq,
                lease_token,
                self.settings.source_lease_seconds,
            )
            await connection.execute(
                """
                UPDATE source_rate_limits SET
                  next_allowed_at = now() + (min_spacing_ms * interval '1 millisecond'),
                  updated_at = now()
                WHERE rate_limit_key = $1
                """,
                row["rate_limit_key"],
            )
            await connection.execute(
                """
                INSERT INTO source_rate_limit_leases(lease_token, rate_limit_key, expires_at)
                VALUES ($1, $2, now() + make_interval(secs => $3))
                """,
                lease_token,
                row["rate_limit_key"],
                self.settings.source_lease_seconds,
            )
            scan_id = await connection.fetchval(
                """
                INSERT INTO scan_runs(source_id, request_key, scan_seq, mode, is_baseline)
                VALUES ($1, $2, $3, 'verify', $4) RETURNING id
                """,
                source_id,
                f"source:{source_id}:verify:{scan_seq}",
                scan_seq,
                row["baseline_completed_at"] is None,
            )
            mutable = dict(row)
            mutable["lease_token"] = lease_token
            return ClaimedScan(scan_id, scan_seq, _source_from_record(mutable))

    async def activate_verified(
        self,
        source_id: int,
        *,
        scan_interval_seconds: int | None = None,
        initial_delay_seconds: int = 0,
        max_jobs: int | None = None,
    ) -> None:
        if scan_interval_seconds is not None and not 300 <= scan_interval_seconds <= 604800:
            raise ValueError("scan interval must be between 300 seconds and seven days")
        if not 0 <= initial_delay_seconds <= 604800:
            raise ValueError("initial delay must be between zero and seven days")
        if max_jobs is not None and not 1 <= max_jobs <= 250:
            raise ValueError("bulk source max_jobs must be between 1 and 250")
        result = await self.pool.execute(
            """
            UPDATE job_sources SET status = 'active', verified_at = now(),
              verification_error = NULL,
              config = CASE WHEN $4::integer IS NULL THEN config
                ELSE jsonb_set(config, '{max_jobs}', to_jsonb($4::integer), true) END,
              scan_interval_seconds = COALESCE($2, scan_interval_seconds),
              next_scan_at = now() + make_interval(secs => $3), updated_at = now()
            WHERE id = $1 AND status IN ('candidate', 'paused', 'invalid')
              AND baseline_completed_at IS NOT NULL
            """,
            source_id,
            scan_interval_seconds,
            initial_delay_seconds,
            max_jobs,
        )
        if result.endswith(" 0"):
            raise RuntimeError("source cannot activate before a successful complete baseline")

    async def source_rows(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(
            SOURCE_SELECT
            + """
              ORDER BY
                CASE s.status WHEN 'active' THEN 0 WHEN 'candidate' THEN 1 ELSE 2 END,
                c.name, s.id
              LIMIT $1
            """,
            limit,
        )
        return [
            {
                "id": row["id"],
                "company": row["company_name"],
                "domain": row["domain"],
                "adapter": row["adapter"],
                "identifier": (row["config"] or {}).get("identifier"),
                "status": row["status"],
                "last_job_count": row["last_job_count"],
                "last_complete_at": row["last_complete_at"].isoformat()
                if row["last_complete_at"]
                else None,
                "verification_error": row["verification_error"],
            }
            for row in rows
        ]

    async def fail_scan(self, claim: ClaimedScan, exc: Exception) -> None:
        async with self.pool.acquire() as connection, connection.transaction():
            failures = await connection.fetchval(
                "SELECT consecutive_failures FROM job_sources WHERE id = $1 FOR UPDATE",
                claim.source.id,
            )
            failures = int(failures or 0) + 1
            delay = min(claim.source.scan_interval_seconds * (2 ** min(failures, 6)), 86400)
            await connection.execute(
                """
                UPDATE scan_runs SET status = 'failed', is_complete = false,
                  finished_at = now(), error_code = 'adapter_error', error_message = $2
                WHERE id = $1 AND status = 'running'
                """,
                claim.scan_id,
                str(exc)[:4000],
            )
            await connection.execute(
                """
                UPDATE job_sources SET consecutive_failures = $2,
                  verification_error = $3,
                  next_scan_at = now() + make_interval(secs => $4),
                  lease_token = NULL, lease_until = NULL, updated_at = now()
                WHERE id = $1 AND lease_token = $5
                """,
                claim.source.id,
                failures,
                str(exc)[:4000],
                delay,
                claim.source.lease_token,
            )
            await self._release_rate_limit(connection, claim.source)

    async def quarantine_scan(
        self, claim: ClaimedScan, result: ScanResult, reason: str
    ) -> ReconcileSummary:
        async with self.pool.acquire() as connection, connection.transaction():
            await connection.execute(
                """
                UPDATE scan_runs SET status = 'quarantined', is_complete = false,
                  finished_at = now(), expected_count = $2, received_count = $3,
                  unique_count = $3, invalid_count = $4, page_count = $5,
                  error_code = 'incomplete_snapshot', error_message = $6,
                  diagnostics = $7
                WHERE id = $1 AND status = 'running'
                """,
                claim.scan_id,
                result.expected_count,
                result.unique_count,
                result.invalid_count,
                result.page_count,
                reason,
                result.diagnostics,
            )
            await connection.execute(
                """
                UPDATE job_sources SET consecutive_failures = consecutive_failures + 1,
                  verification_error = $2,
                  next_scan_at = now() + make_interval(secs => scan_interval_seconds),
                  lease_token = NULL, lease_until = NULL, updated_at = now()
                WHERE id = $1 AND lease_token = $3
                """,
                claim.source.id,
                reason,
                claim.source.lease_token,
            )
            await self._release_rate_limit(connection, claim.source)
        return ReconcileSummary(claim.scan_id, "quarantined", False, reason=reason)

    async def apply_scan(self, claim: ClaimedScan, result: ScanResult) -> ReconcileSummary:
        configured_max_jobs = claim.source.config.get("max_jobs")
        if configured_max_jobs is not None and result.unique_count > int(configured_max_jobs):
            return await self.quarantine_scan(
                claim, result,
                f"source exceeded its reviewed job budget: {result.unique_count} > {configured_max_jobs}",
            )
        if not result.complete:
            return await self.quarantine_scan(
                claim, result, "adapter returned an incomplete snapshot"
            )
        if result.expected_count is not None and result.expected_count != result.unique_count:
            return await self.quarantine_scan(
                claim,
                result,
                f"expected {result.expected_count} jobs, normalized {result.unique_count}",
            )
        prior = claim.source.last_job_count
        if (
            prior is not None
            and prior >= self.settings.count_collapse_min_prior
            and result.unique_count < prior * self.settings.count_collapse_ratio
        ):
            return await self.quarantine_scan(
                claim,
                result,
                f"count collapse quarantined: {prior} -> {result.unique_count}",
            )

        discovered = updated = reopened = closed = unchanged = matched_count = 0
        async with self.pool.acquire() as connection, connection.transaction():
            source_row = await connection.fetchrow(
                "SELECT * FROM job_sources WHERE id = $1 FOR UPDATE", claim.source.id
            )
            if source_row is None:
                raise RuntimeError("source disappeared while scan was running")
            if source_row["lease_token"] != claim.source.lease_token:
                await connection.execute(
                    """
                    UPDATE scan_runs SET status = 'superseded', finished_at = now(),
                      error_code = 'lease_lost',
                      error_message = 'scan no longer owns the source lease'
                    WHERE id = $1 AND status = 'running'
                    """,
                    claim.scan_id,
                )
                await self._release_rate_limit(connection, claim.source)
                return ReconcileSummary(claim.scan_id, "superseded", False)
            if claim.scan_seq <= source_row["last_applied_scan_seq"]:
                await connection.execute(
                    """
                    UPDATE scan_runs SET status = 'superseded', finished_at = now(),
                      error_code = 'stale_scan', error_message = 'newer scan already applied'
                    WHERE id = $1 AND status = 'running'
                    """,
                    claim.scan_id,
                )
                await connection.execute(
                    """
                    UPDATE job_sources SET lease_token = NULL, lease_until = NULL,
                      updated_at = now() WHERE id = $1 AND lease_token = $2
                    """,
                    claim.source.id,
                    claim.source.lease_token,
                )
                await self._release_rate_limit(connection, claim.source)
                return ReconcileSummary(claim.scan_id, "superseded", False)

            baseline = source_row["baseline_completed_at"] is None
            existing_rows = await connection.fetch(
                "SELECT * FROM jobs WHERE source_id = $1 FOR UPDATE", claim.source.id
            )
            existing = {row["external_job_id"]: row for row in existing_rows}
            observed_ids: set[str] = set()
            unchanged_rows: list[dict[str, Any]] = []

            for job in result.jobs:
                observed_ids.add(job.external_id)
                current = existing.get(job.external_id)
                content_hash = job.content_hash()
                payload = job.database_payload()
                matches_watch = self.matcher.matches(job.title)
                signals = JobSignals.derive(job.title, job.location, job.description_text)
                if current is None:
                    job_id = await connection.fetchval(
                        """
                        INSERT INTO jobs(
                          source_id, external_job_id, title, location, canonical_url,
                          apply_url, published_at, description_text, employment_type,
                          is_remote, current_content_hash, raw, first_seen_scan_id,
                          last_seen_scan_id, skills, role_families, seniority, min_years,
                          countries, no_sponsorship
                        ) VALUES (
                          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13,
                          $14, $15, $16, $17, $18, $19
                        ) RETURNING id
                        """,
                        claim.source.id,
                        job.external_id,
                        job.title,
                        job.location,
                        job.canonical_url,
                        job.apply_url,
                        job.published_at,
                        job.description_text,
                        job.employment_type,
                        job.is_remote,
                        content_hash,
                        job.raw,
                        claim.scan_id,
                        signals.skills,
                        signals.role_families,
                        signals.seniority,
                        signals.min_years,
                        signals.countries,
                        signals.no_sponsorship,
                    )
                    version_id = await self._insert_version(
                        connection,
                        job_id,
                        1,
                        claim.scan_id,
                        "discovered",
                        "open",
                        content_hash,
                        payload,
                        matches_watch,
                    )
                    discovered += 1
                    if not baseline and matches_watch:
                        matched_count += 1
                        await self._fanout(
                            connection,
                            job_id,
                            version_id,
                            "job.discovered",
                            claim.source,
                            payload,
                        )
                    continue

                if current["lifecycle_state"] == "closed":
                    version_no = current["current_version_no"] + 1
                    await self._update_present_job(
                        connection, current["id"], job, content_hash, claim.scan_id, version_no
                    )
                    version_id = await self._insert_version(
                        connection,
                        current["id"],
                        version_no,
                        claim.scan_id,
                        "reopened",
                        "open",
                        content_hash,
                        payload,
                        matches_watch,
                    )
                    reopened += 1
                    if not baseline and matches_watch:
                        matched_count += 1
                        await self._fanout(
                            connection,
                            current["id"],
                            version_id,
                            "job.reopened",
                            claim.source,
                            payload,
                        )
                elif current["current_content_hash"] != content_hash:
                    version_no = current["current_version_no"] + 1
                    await self._update_present_job(
                        connection, current["id"], job, content_hash, claim.scan_id, version_no
                    )
                    await self._insert_version(
                        connection,
                        current["id"],
                        version_no,
                        claim.scan_id,
                        "updated",
                        "open",
                        content_hash,
                        payload,
                        matches_watch,
                    )
                    updated += 1
                else:
                    unchanged_rows.append(
                        {"id": current["id"], "raw": job.raw, **signals.as_record()}
                    )
                    unchanged += 1

            if unchanged_rows:
                # One set-based update avoids a DB round trip for every stable
                # listing while preserving per-job raw payload and last-seen data.
                await connection.execute(
                    """
                    UPDATE jobs AS current SET
                      last_seen_scan_id = $2, last_seen_at = now(),
                      missing_full_scans = 0, raw = seen.raw, updated_at = now(),
                      skills = seen.skills, role_families = seen.role_families,
                      seniority = seen.seniority, min_years = seen.min_years,
                      countries = seen.countries, no_sponsorship = seen.no_sponsorship
                    FROM jsonb_to_recordset($1::jsonb) AS seen(
                      id bigint, raw jsonb, skills text[], role_families text[],
                      seniority smallint, min_years smallint, countries text[],
                      no_sponsorship boolean
                    )
                    WHERE current.id = seen.id AND current.source_id = $3
                    """,
                    unchanged_rows,
                    claim.scan_id,
                    claim.source.id,
                )

            if bool(claim.source.config.get("closure_safe", False)):
                for external_id, current in existing.items():
                    if external_id in observed_ids or current["lifecycle_state"] == "closed":
                        continue
                    misses = current["missing_full_scans"] + 1
                    if misses < source_row["closure_miss_threshold"]:
                        await connection.execute(
                            "UPDATE jobs SET missing_full_scans = $2, updated_at = now() "
                            "WHERE id = $1",
                            current["id"],
                            misses,
                        )
                        continue
                    version_no = current["current_version_no"] + 1
                    await connection.execute(
                        """
                        UPDATE jobs SET lifecycle_state = 'closed', closed_at = now(),
                          missing_full_scans = $2, current_version_no = $3,
                          last_changed_at = now(), updated_at = now()
                        WHERE id = $1
                        """,
                        current["id"],
                        misses,
                        version_no,
                    )
                    closed_payload = {
                        "external_id": current["external_job_id"],
                        "title": current["title"],
                        "location": current["location"],
                        "canonical_url": current["canonical_url"],
                        "published_at": current["published_at"].isoformat()
                        if current["published_at"]
                        else None,
                    }
                    await self._insert_version(
                        connection,
                        current["id"],
                        version_no,
                        claim.scan_id,
                        "closed",
                        "closed",
                        current["current_content_hash"],
                        closed_payload,
                        False,
                    )
                    closed += 1

            await connection.execute(
                """
                UPDATE scan_runs SET status = 'succeeded', is_complete = true,
                  is_baseline = $7,
                  finished_at = now(), expected_count = $2, received_count = $3,
                  unique_count = $3, invalid_count = $4, page_count = $5,
                  diagnostics = $6
                WHERE id = $1 AND status = 'running'
                """,
                claim.scan_id,
                result.expected_count,
                result.unique_count,
                result.invalid_count,
                result.page_count,
                result.diagnostics,
                baseline,
            )
            await connection.execute(
                """
                UPDATE job_sources SET
                  last_applied_scan_seq = $2,
                  baseline_completed_at = COALESCE(baseline_completed_at, now()),
                  last_success_at = now(), last_complete_at = now(),
                  last_job_count = $3, consecutive_failures = 0,
                  verification_error = NULL,
                  next_scan_at = now() + make_interval(secs => scan_interval_seconds),
                  lease_token = NULL, lease_until = NULL, updated_at = now()
                WHERE id = $1 AND lease_token = $4
                """,
                claim.source.id,
                claim.scan_seq,
                result.unique_count,
                claim.source.lease_token,
            )
            await self._release_rate_limit(connection, claim.source)

        return ReconcileSummary(
            claim.scan_id,
            "succeeded",
            baseline,
            discovered,
            updated,
            reopened,
            closed,
            unchanged,
            matched_count,
        )

    async def _release_rate_limit(self, connection: asyncpg.Connection, source: Source) -> None:
        await connection.execute(
            """
            DELETE FROM source_rate_limit_leases
            WHERE rate_limit_key = $1 AND lease_token = $2
            """,
            source.rate_limit_key,
            source.lease_token,
        )

    async def _update_present_job(
        self,
        connection: asyncpg.Connection,
        job_id: int,
        job: NormalizedJob,
        content_hash: str,
        scan_id: int,
        version_no: int,
    ) -> None:
        signals = JobSignals.derive(job.title, job.location, job.description_text)
        await connection.execute(
            """
            UPDATE jobs SET title = $2, location = $3, canonical_url = $4,
              apply_url = $5, published_at = $6, description_text = $7,
              employment_type = $8, is_remote = $9,
              lifecycle_state = 'open', closed_at = NULL, missing_full_scans = 0,
              current_version_no = $10, current_content_hash = $11, raw = $12,
              last_seen_scan_id = $13, last_seen_at = now(), last_changed_at = now(),
              last_opened_at = now(), updated_at = now(),
              skills = $14, role_families = $15, seniority = $16, min_years = $17,
              countries = $18, no_sponsorship = $19
            WHERE id = $1
            """,
            job_id,
            job.title,
            job.location,
            job.canonical_url,
            job.apply_url,
            job.published_at,
            job.description_text,
            job.employment_type,
            job.is_remote,
            version_no,
            content_hash,
            job.raw,
            scan_id,
            signals.skills,
            signals.role_families,
            signals.seniority,
            signals.min_years,
            signals.countries,
            signals.no_sponsorship,
        )

    async def _insert_version(
        self,
        connection: asyncpg.Connection,
        job_id: int,
        version_no: int,
        scan_id: int,
        change_type: str,
        lifecycle_state: str,
        content_hash: str,
        payload: dict[str, Any],
        matches_watch: bool,
    ) -> int:
        return await connection.fetchval(
            """
            INSERT INTO job_versions(
              job_id, version_no, scan_id, change_type, lifecycle_state,
              content_hash, normalized_payload, matches_watch
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            """,
            job_id,
            version_no,
            scan_id,
            change_type,
            lifecycle_state,
            content_hash,
            payload,
            matches_watch,
        )

    async def _fanout(
        self,
        connection: asyncpg.Connection,
        job_id: int,
        version_id: int,
        event_type: str,
        source: Source,
        job_payload: dict[str, Any],
    ) -> None:
        endpoints = await connection.fetch(
            "SELECT id FROM notification_endpoints WHERE enabled = true"
        )
        delivery_payload = {
            **job_payload,
            "company": source.company_name,
            "domain": source.domain,
            "source_key": source.source_key,
            "event_type": event_type,
        }
        for endpoint in endpoints:
            key_material = f"{endpoint['id']}:{version_id}:{event_type}"
            key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
            await connection.execute(
                """
                INSERT INTO notification_outbox(
                  endpoint_id, job_id, job_version_id, event_type,
                  idempotency_key, payload, max_attempts
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                endpoint["id"],
                job_id,
                version_id,
                event_type,
                key,
                delivery_payload,
                self.settings.notifier_max_attempts,
            )

    async def feed(self, limit: int, after: int | None = None) -> dict[str, Any]:
        if after is None:
            rows = await self.pool.fetch(
                """
                SELECT v.id AS cursor, v.observed_at, j.external_job_id, j.title,
                       j.location, j.canonical_url, j.published_at, s.source_key,
                       c.name AS company, c.domain
                FROM job_versions v
                JOIN jobs j ON j.id = v.job_id
                JOIN job_sources s ON s.id = j.source_id
                JOIN companies c ON c.id = s.company_id
                WHERE v.matches_watch
                  AND v.change_type IN ('discovered', 'reopened')
                ORDER BY v.id ASC
                LIMIT $1
                """,
                limit + 1,
            )
            has_more = len(rows) > limit
            rows = rows[:limit]
        else:
            rows = await self.pool.fetch(
                """
                SELECT v.id AS cursor, v.observed_at, j.external_job_id, j.title,
                       j.location, j.canonical_url, j.published_at, s.source_key,
                       c.name AS company, c.domain
                FROM job_versions v
                JOIN jobs j ON j.id = v.job_id
                JOIN job_sources s ON s.id = j.source_id
                JOIN companies c ON c.id = s.company_id
                WHERE v.matches_watch
                  AND v.change_type IN ('discovered', 'reopened')
                  AND v.id > $1
                ORDER BY v.id ASC
                LIMIT $2
                """,
                after,
                limit + 1,
            )
            has_more = len(rows) > limit
            rows = rows[:limit]
        items = [
            {
                "id": f"version:{row['cursor']}",
                "company": row["company"],
                "domain": row["domain"],
                "title": row["title"],
                "location": row["location"] or "",
                "url": row["canonical_url"],
                "published": row["published_at"].isoformat() if row["published_at"] else None,
                "foundAt": row["observed_at"].isoformat(),
            }
            for row in rows
        ]
        next_cursor = rows[-1]["cursor"] if rows else after
        return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}

    @staticmethod
    def _public_job(row: asyncpg.Record, *, include_description: bool = False) -> dict[str, Any]:
        item = {
            "id": row["id"],
            "title": row["title"],
            "company": row["company"],
            "domain": row["domain"],
            "location": row["location"],
            "url": row["canonical_url"],
            "applyUrl": row["apply_url"],
            "publishedAt": row["published_at"].isoformat() if row["published_at"] else None,
            "firstSeenAt": row["first_seen_at"].isoformat(),
            "employmentType": row["employment_type"],
            "isRemote": row["is_remote"],
            "sourceKey": row["source_key"],
        }
        if include_description:
            item["descriptionText"] = row["description_text"]
        return item

    async def list_jobs(
        self,
        limit: int = 24,
        *,
        before: int | None = None,
        q: str | None = None,
        company: str | None = None,
        location: str | None = None,
        remote: bool | None = None,
    ) -> dict[str, Any]:
        """Page through currently open jobs, newest discovery first."""
        if q is not None:
            q = q.strip() or None
        if company is not None:
            company = company.strip() or None
        if location is not None:
            location = location.strip() or None
        rows = await self.pool.fetch(
            """
            SELECT j.id, j.title, j.location, j.canonical_url, j.apply_url,
                   j.published_at, j.first_seen_at, j.employment_type,
                   j.is_remote, s.source_key, c.name AS company, c.domain
            FROM jobs j
            JOIN job_sources s ON s.id = j.source_id
            JOIN companies c ON c.id = s.company_id
            WHERE j.lifecycle_state = 'open' AND s.status = 'active'
              AND ($1::bigint IS NULL OR j.id < $1)
              AND ($2::text IS NULL OR strpos(lower(j.title), lower($2)) > 0
                   OR strpos(lower(c.name), lower($2)) > 0
                   OR strpos(lower(coalesce(j.location, '')), lower($2)) > 0)
              AND ($3::text IS NULL OR strpos(lower(c.name), lower($3)) > 0)
              AND ($4::text IS NULL OR strpos(lower(coalesce(j.location, '')), lower($4)) > 0)
              AND ($5::boolean IS NULL OR j.is_remote = $5)
            ORDER BY j.id DESC
            LIMIT $6
            """,
            before,
            q,
            company,
            location,
            remote,
            limit + 1,
        )
        has_more = len(rows) > limit
        page = rows[:limit]
        return {
            "items": [self._public_job(row) for row in page],
            "nextCursor": page[-1]["id"] if has_more else None,
            "hasMore": has_more,
        }

    async def match_jobs(
        self,
        *,
        skills: list[str],
        families: list[str],
        levels: list[int],
        years: float | None,
        country: str | None,
        needs_sponsorship: bool,
        remote_only: bool,
        title_patterns: list[str] | None = None,
        limit: int = 24,
        offset: int = 0,
    ) -> dict[str, Any]:
        """Rank open jobs for one candidate; hard filters first, then relevance."""
        rows = await self.pool.fetch(
            """
            WITH candidates AS (
              SELECT j.id, j.title, j.location, j.canonical_url, j.apply_url,
                     j.published_at, j.first_seen_at, j.employment_type,
                     j.is_remote, s.source_key, c.name AS company, c.domain,
                     j.seniority, j.role_families,
                     ARRAY(
                       SELECT unnest(j.skills) INTERSECT SELECT unnest($1::text[]) ORDER BY 1
                     ) AS matched_skills,
                     j.role_families && $2::text[] AS family_match,
                     EXISTS (
                       SELECT 1 FROM unnest($10::text[]) AS pattern WHERE j.title ~* pattern
                     ) AS title_match
              FROM jobs j
              JOIN job_sources s ON s.id = j.source_id
              JOIN companies c ON c.id = s.company_id
              WHERE j.lifecycle_state = 'open' AND s.status = 'active'
                AND (j.seniority IS NULL OR j.seniority = ANY($3::smallint[]))
                AND ($4::real IS NULL OR j.min_years IS NULL OR j.min_years <= $4 + 1)
                AND ($5::text IS NULL OR cardinality(j.countries) = 0
                     OR $5 = ANY(j.countries))
                AND (NOT $6::boolean OR NOT j.no_sponsorship)
                AND (NOT $7::boolean OR j.is_remote IS TRUE
                     OR coalesce(j.location, '') ~* '\\m(remote|anywhere)\\M')
            ), scored AS (
              SELECT *,
                     (CASE WHEN title_match THEN 20 ELSE 0 END)
                     + (CASE WHEN family_match THEN 10 ELSE 0 END)
                     + 2 * cardinality(matched_skills)
                     + (CASE WHEN seniority IS NOT NULL THEN 1 ELSE 0 END) AS score
              FROM candidates
              WHERE (cardinality($2::text[]) = 0 AND cardinality($1::text[]) = 0
                     AND cardinality($10::text[]) = 0)
                 OR title_match
                 OR family_match
                 OR (cardinality(role_families) = 0 AND cardinality(matched_skills) >= 3)
                 OR cardinality(matched_skills) >= 5
                 OR (cardinality($2::text[]) = 0 AND cardinality(matched_skills) >= 2)
            )
            SELECT * FROM scored
            ORDER BY score DESC, id DESC
            LIMIT $8 OFFSET $9
            """,
            skills,
            families,
            levels,
            years,
            country,
            needs_sponsorship,
            remote_only,
            limit + 1,
            offset,
            title_patterns or [],
        )
        has_more = len(rows) > limit
        items = []
        for row in rows[:limit]:
            item = self._public_job(row)
            level = row["seniority"]
            item["match"] = {
                "score": row["score"],
                "skills": list(row["matched_skills"]),
                "roleMatch": row["family_match"],
                "titleMatch": row["title_match"],
                "level": SENIORITY_LABELS[level] if level is not None else None,
            }
            items.append(item)
        return {
            "items": items,
            "nextCursor": offset + limit if has_more else None,
            "hasMore": has_more,
        }

    async def refresh_signals(
        self, batch_size: int = 500, *, only_missing: bool = False, limit: int | None = None
    ) -> int:
        """Recompute match signals for open jobs from their stored text."""
        refreshed = 0
        last_id = 0
        while limit is None or refreshed < limit:
            size = batch_size if limit is None else min(batch_size, limit - refreshed)
            rows = await self.pool.fetch(
                """
                SELECT id, title, location, description_text FROM jobs
                WHERE lifecycle_state = 'open' AND id > $1
                  AND (NOT $3::boolean OR signals_version IS NULL)
                ORDER BY id LIMIT $2
                """,
                last_id,
                size,
                only_missing,
            )
            if not rows:
                return refreshed
            records = [
                {
                    "id": row["id"],
                    **JobSignals.derive(
                        row["title"], row["location"], row["description_text"]
                    ).as_record(),
                }
                for row in rows
            ]
            await self.pool.execute(
                """
                UPDATE jobs AS current SET
                  skills = seen.skills, role_families = seen.role_families,
                  seniority = seen.seniority, min_years = seen.min_years,
                  countries = seen.countries, no_sponsorship = seen.no_sponsorship,
                  signals_version = $2
                FROM jsonb_to_recordset($1::jsonb) AS seen(
                  id bigint, skills text[], role_families text[], seniority smallint,
                  min_years smallint, countries text[], no_sponsorship boolean
                )
                WHERE current.id = seen.id
                """,
                records,
                SIGNALS_VERSION,
            )
            refreshed += len(rows)
            last_id = rows[-1]["id"]
        return refreshed

    async def get_job(self, job_id: int) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            """
            SELECT j.id, j.title, j.location, j.canonical_url, j.apply_url,
                   j.published_at, j.first_seen_at, j.employment_type,
                   j.is_remote, j.description_text, s.source_key,
                   c.name AS company, c.domain
            FROM jobs j
            JOIN job_sources s ON s.id = j.source_id
            JOIN companies c ON c.id = s.company_id
            WHERE j.id = $1 AND j.lifecycle_state = 'open' AND s.status = 'active'
            """,
            job_id,
        )
        return self._public_job(row, include_description=True) if row else None

    async def health_summary(self) -> dict[str, Any]:
        row = await self.pool.fetchrow(
            """
            SELECT
              count(*) FILTER (WHERE status = 'active') AS active_sources,
              count(*) FILTER (WHERE status = 'candidate') AS candidate_sources,
              count(*) FILTER (WHERE status = 'active' AND last_complete_at IS NULL) AS unseeded,
              count(*) FILTER (WHERE status = 'active' AND next_scan_at < now()) AS overdue
            FROM job_sources
            """
        )
        pending = await self.pool.fetchval(
            "SELECT count(*) FROM notification_outbox WHERE status IN ('pending', 'processing')"
        )
        jobs = await self.pool.fetchval("SELECT count(*) FROM jobs WHERE lifecycle_state = 'open'")
        return {**dict(row), "open_jobs": jobs, "pending_notifications": pending}
