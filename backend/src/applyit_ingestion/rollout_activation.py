"""Bounded activation of reviewed, ranked ATS candidates."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from .config import Settings
from .repository import Repository
from .rollout import (
    RANKING_VERSION,
    SIX_HOURS,
    STAGE_GATES,
    _instant,
    check_live_ats_metadata,
    check_official_careers_link,
    first_scan_delay,
    is_ambiguous_employer_name,
    is_intermediary_name,
)
from .scanner import scan_with_lease

_ROLLOUT_ADVISORY_LOCK = 0x4150504C59524F4C


async def _record_attempt(
    pool: Any, source_id: int, outcome: str, reason: str | None = None,
    *, retry_seconds: int | None = None,
) -> None:
    await pool.execute(
        """
        INSERT INTO source_rollout_attempts(source_id, outcome, reason, attempted_at, next_attempt_at)
        VALUES ($1, $2, $3, now(),
                CASE WHEN $4::integer IS NULL THEN NULL
                     ELSE now() + make_interval(secs => $4) END)
        ON CONFLICT (source_id) DO UPDATE SET
          outcome = EXCLUDED.outcome,
          reason = EXCLUDED.reason,
          attempted_at = now(),
          next_attempt_at = EXCLUDED.next_attempt_at
        """,
        source_id, outcome, (reason or "")[:500], retry_seconds,
    )


def validate_reviewed_plan(plan: dict[str, Any], target: int, *, now: datetime | None = None) -> None:
    now = (now or datetime.now(UTC)).astimezone(UTC)
    if target not in STAGE_GATES or plan.get("version") != RANKING_VERSION:
        raise ValueError("unsupported rollout stage or ranking version")
    if int(plan.get("target", 0)) < target:
        raise ValueError("reviewed plan was prepared for a smaller stage")
    created = _instant(str(plan.get("created_at", "")), "created_at")
    checked = _instant(str(plan.get("identity_checked_at", "")), "identity_checked_at")
    if created > now or created < now - timedelta(days=7):
        raise ValueError("ranking plan is stale or future-dated")
    if checked > now or checked < now - timedelta(days=7):
        raise ValueError("identity checks are stale or future-dated")
    seen: set[str] = set()
    minimum_roles = int(plan.get("min_target_roles", 5))
    board_cap = min(int(plan.get("max_board_jobs", 250)), 250)
    for row in plan.get("approved", []):
        key = str(row.get("source_key") or "")
        identity = row.get("identity") or {}
        if not key or key in seen or not isinstance(identity, dict):
            raise ValueError("approved list has a missing or duplicate source identity")
        seen.add(key)
        signals = row.get("signals") or {}
        if (
            not isinstance(signals, dict)
            or int(signals.get("target_roles", 0)) < minimum_roles
            or int(signals.get("active_jobs", board_cap + 1)) > board_cap
        ):
            raise ValueError(f"source {key} does not meet plan job-signal gates")
        evidence_type = identity.get("evidence_type")
        if not identity.get("reviewer") or evidence_type not in {
            "official_careers_link", "ats_live_metadata"
        }:
            raise ValueError(f"source {key} is missing reviewed identity evidence")
        if evidence_type == "official_careers_link" and not identity.get("linked_ats_url"):
            raise ValueError(f"source {key} is missing a verified official careers link")
        if evidence_type == "ats_live_metadata" and not identity.get("observed_name"):
            raise ValueError(f"source {key} is missing ATS-owned board metadata")
        if _instant(str(identity.get("checked_at", "")), "checked_at") < now - timedelta(days=7):
            raise ValueError(f"source {key} has stale identity evidence")


async def _counts(pool: Any) -> dict[str, int]:
    row = await pool.fetchrow(
        """
        SELECT count(*) FILTER (WHERE status = 'active') AS active,
               count(*) FILTER (WHERE status = 'active' AND verified_at <= now() - interval '48 hours') AS aged_48h,
               count(*) FILTER (WHERE status = 'active' AND verified_at <= now() - interval '72 hours') AS aged_72h,
               count(*) FILTER (WHERE status = 'active' AND next_scan_at < now() - interval '1 hour') AS late_over_one_hour,
               count(*) FILTER (WHERE status = 'active' AND last_complete_at IS NULL) AS never_completed,
               count(*) FILTER (WHERE status = 'active' AND last_complete_at < now() - interval '8 hours') AS stale_complete_over_eight_hours
        FROM job_sources
        """
    )
    counts = {key: int(row[key]) for key in (
        "active", "aged_48h", "aged_72h", "late_over_one_hour", "never_completed",
        "stale_complete_over_eight_hours",
    )}
    recent = await pool.fetchrow(
        """
        SELECT count(*) AS total,
               count(*) FILTER (WHERE r.status IN ('failed', 'quarantined')) AS failed
        FROM scan_runs r JOIN job_sources s ON s.id = r.source_id
        WHERE s.status = 'active' AND r.started_at >= now() - interval '24 hours'
        """
    )
    counts["recent_scans"] = int(recent["total"])
    counts["recent_failed_scans"] = int(recent["failed"])
    counts["stale_outbox"] = int(await pool.fetchval(
        "SELECT count(*) FROM notification_outbox "
        "WHERE status IN ('pending','processing') AND created_at < now() - interval '1 hour'"
    ))
    return counts


def _check_stage(counts: dict[str, int], target: int) -> None:
    minimum, hours = STAGE_GATES[target]
    if counts["active"] < minimum:
        raise RuntimeError(f"stage {target} requires at least {minimum} active sources")
    if hours and counts[f"aged_{hours}h"] < minimum:
        raise RuntimeError(f"stage {target} requires {minimum} sources observed for {hours} hours")
    if counts["never_completed"]:
        raise RuntimeError("active sources are missing a complete baseline")
    if counts["late_over_one_hour"] > max(2, counts["active"] // 20):
        raise RuntimeError("scanner lag is too high to advance this rollout")
    if hours:
        if counts["stale_complete_over_eight_hours"] > max(2, counts["active"] // 20):
            raise RuntimeError("complete-scan freshness is too low to advance this rollout")
        if counts["recent_scans"] and counts["recent_failed_scans"] * 20 > counts["recent_scans"]:
            raise RuntimeError("recent scan failure/quarantine rate exceeds five percent")
        if counts["stale_outbox"]:
            raise RuntimeError("notification outbox is more than one hour behind")


async def activate_reviewed_plan(
    repository: Repository,
    settings: Settings,
    plan: dict[str, Any],
    *,
    target: int,
    execute: bool = False,
    max_attempts: int = 10,
    max_seconds: int = 3300,
) -> dict[str, Any]:
    """Dry-run by default; execution is staged, capped and resumable."""
    if not 1 <= max_attempts <= 20:
        raise ValueError("max_attempts must be between 1 and 20")
    if not 1 <= max_seconds <= 3300:
        raise ValueError("max_seconds must be between 1 and 3300")
    validate_reviewed_plan(plan, target)
    pool = repository.pool
    counts = await _counts(pool)
    _check_stage(counts, target)
    needed = max(0, target - counts["active"])
    approved = list(plan["approved"])
    board_job_cap = min(int(plan.get("max_board_jobs", 250)), 250)
    total_job_cap = min(int(plan.get("max_estimated_jobs", 100_000)), 100_000)
    output: dict[str, Any] = {
        "stage": target,
        "mode": "execute" if execute else "dry_run",
        "active_before": counts["active"],
        "remaining_to_stage": needed,
        "approved_in_plan": len(approved),
        "max_attempts": max_attempts,
        "max_seconds": max_seconds,
        "observation": counts,
        "results": [],
    }
    if not execute or needed == 0:
        return output

    deadline = time.monotonic() + max_seconds

    async with pool.acquire() as lock_connection:
        if not await lock_connection.fetchval("SELECT pg_try_advisory_lock($1)", _ROLLOUT_ADVISORY_LOCK):
            raise RuntimeError("another bulk activation is already running")
        try:
            for item in approved:
                if len(output["results"]) >= max_attempts or needed <= 0:
                    break
                if deadline - time.monotonic() < 30:
                    output["stopped_reason"] = "wall_clock_budget"
                    break
                counts = await _counts(pool)
                _check_stage(counts, target)
                needed = target - counts["active"]
                if needed <= 0:
                    break
                key = str(item["source_key"])
                row = await pool.fetchrow(
                    """
                    SELECT s.id, s.status, s.careers_url, s.adapter,
                           s.config->>'identifier' AS identifier, c.name
                    FROM job_sources s JOIN companies c ON c.id = s.company_id
                    WHERE s.source_key = $1
                    """,
                    key,
                )
                if row is None or row["status"] != "candidate":
                    continue
                source_id = int(row["id"])
                if is_intermediary_name(str(item["name"])) or is_ambiguous_employer_name(str(item["name"])):
                    await _record_attempt(
                        pool, source_id, "review", "ambiguous employer or intermediary board"
                    )
                    continue
                previous = await pool.fetchrow(
                    "SELECT outcome, next_attempt_at FROM source_rollout_attempts WHERE source_id = $1",
                    source_id,
                )
                if previous and (
                    previous["outcome"] in {"review", "activated"}
                    or (previous["next_attempt_at"] and previous["next_attempt_at"] > datetime.now(UTC))
                ):
                    continue
                if (
                    row["careers_url"] != item["careers_url"]
                    or row["adapter"] != item["adapter"]
                    or row["identifier"] != item["identifier"]
                    or row["name"] != item["name"]
                ):
                    output["results"].append({"source_key": key, "status": "identity_changed"})
                    await _record_attempt(pool, source_id, "review", "source identity changed")
                    continue
                identity = item["identity"]
                if identity["evidence_type"] == "official_careers_link":
                    linked, detail = await asyncio.to_thread(
                        check_official_careers_link,
                        identity["official_careers_url"],
                        item["careers_url"],
                    )
                    fresh_evidence = {"linked_ats_url": detail}
                else:
                    linked, fresh_evidence = await asyncio.to_thread(
                        check_live_ats_metadata, item
                    )
                    detail = fresh_evidence.get("reason", "ATS board metadata changed")
                if not linked:
                    output["results"].append({
                        "source_key": key, "status": "identity_review_required", "reason": detail,
                    })
                    await _record_attempt(pool, source_id, "review", detail)
                    continue
                await pool.execute(
                    """
                    INSERT INTO source_rollout_reviews(
                      source_id, ranking_version, score, score_inputs,
                      registry_sha256, signals_sha256, evidence_type,
                      official_domain, official_careers_url, linked_ats_url,
                      metadata_url, observed_name, response_sha256,
                      reviewer, reviewed_at, identity_checked_at
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
                    ON CONFLICT (source_id) DO UPDATE SET
                      ranking_version = EXCLUDED.ranking_version,
                      score = EXCLUDED.score,
                      score_inputs = EXCLUDED.score_inputs,
                      registry_sha256 = EXCLUDED.registry_sha256,
                      signals_sha256 = EXCLUDED.signals_sha256,
                      evidence_type = EXCLUDED.evidence_type,
                      official_domain = EXCLUDED.official_domain,
                      official_careers_url = EXCLUDED.official_careers_url,
                      linked_ats_url = EXCLUDED.linked_ats_url,
                      metadata_url = EXCLUDED.metadata_url,
                      observed_name = EXCLUDED.observed_name,
                      response_sha256 = EXCLUDED.response_sha256,
                      reviewer = EXCLUDED.reviewer,
                      reviewed_at = EXCLUDED.reviewed_at,
                      identity_checked_at = now(), updated_at = now()
                    """,
                    source_id, RANKING_VERSION, item["score"], item["signals"],
                    plan["registry_sha256"], plan["signals_sha256"],
                    identity["evidence_type"], identity.get("official_domain"),
                    identity.get("official_careers_url"), fresh_evidence.get("linked_ats_url"),
                    fresh_evidence.get("metadata_url"), fresh_evidence.get("observed_name"),
                    fresh_evidence.get("response_sha256"), identity["reviewer"],
                    _instant(identity["reviewed_at"], "reviewed_at"),
                )
                claim = await repository.claim_verification(source_id)
                if claim is None:
                    output["results"].append({"source_key": key, "status": "not_claimable"})
                    await _record_attempt(pool, source_id, "retry", "source not claimable", retry_seconds=900)
                    continue
                try:
                    async with asyncio.timeout(min(300, max(1, deadline - time.monotonic()))):
                        scan = await scan_with_lease(repository, settings, claim)
                        if scan.unique_count == 0:
                            summary = await repository.quarantine_scan(
                                claim, scan, "candidate returned zero jobs; requires manual review",
                            )
                        elif scan.unique_count > board_job_cap:
                            summary = await repository.quarantine_scan(
                                claim, scan,
                                f"candidate exceeds per-board job budget: {scan.unique_count} > {board_job_cap}",
                            )
                        else:
                            growth_allowance = max(10, (scan.unique_count + 3) // 4)
                            source_cap = min(board_job_cap, scan.unique_count + growth_allowance)
                            allocated = await pool.fetchval(
                                """
                                SELECT coalesce(sum(coalesce(
                                  (config->>'max_jobs')::integer,
                                  last_job_count, 0
                                )), 0)
                                FROM job_sources WHERE status = 'active'
                                """
                            )
                            if int(allocated) + source_cap > total_job_cap:
                                summary = await repository.quarantine_scan(
                                    claim, scan, "catalog would exceed total reviewed job budget",
                                )
                            else:
                                summary = await repository.apply_scan(claim, scan)
                except Exception as exc:  # noqa: BLE001 - record failed scan and continue rollout
                    await repository.fail_scan(claim, exc)
                    output["results"].append({
                        "source_key": key, "status": "scan_failed", "reason": str(exc)[:200],
                    })
                    await _record_attempt(pool, source_id, "retry", str(exc), retry_seconds=21_600)
                    continue
                if summary.status != "succeeded":
                    output["results"].append({
                        "source_key": key, "status": summary.status, "reason": summary.reason,
                    })
                    await _record_attempt(
                        pool, source_id,
                        "review" if summary.status == "quarantined" else "retry",
                        summary.reason or summary.status,
                        retry_seconds=None if summary.status == "quarantined" else 21_600,
                    )
                    continue
                await repository.activate_verified(
                    source_id,
                    scan_interval_seconds=SIX_HOURS,
                    initial_delay_seconds=first_scan_delay(key),
                    max_jobs=source_cap,
                )
                output["results"].append({
                    "source_key": key, "status": "activated", "baseline_jobs": scan.unique_count,
                })
                await _record_attempt(pool, source_id, "activated")
            output["active_after"] = (await _counts(pool))["active"]
            output["remaining_to_stage"] = max(0, target - output["active_after"])
            return output
        finally:
            await lock_connection.execute("SELECT pg_advisory_unlock($1)", _ROLLOUT_ADVISORY_LOCK)
