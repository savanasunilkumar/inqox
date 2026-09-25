"""One-off removal of the unscanned synthetic registry candidate."""

from __future__ import annotations

from typing import Any

import asyncpg

SANDBOX_SOURCE_KEY = "greenhouse:examplecorpsandbox"


def _refusal_reasons(row: dict[str, Any]) -> list[str]:
    reasons: list[str] = []
    if row["status"] != "candidate":
        reasons.append("source is not a candidate")
    if row["origin"] != "ats-scrapers-hosted-registry":
        reasons.append("source is not a registry import")
    if row["registry_key"] != SANDBOX_SOURCE_KEY or row["domain"] is not None:
        reasons.append("company is not the untouched registry company")
    if row["baseline_completed_at"] is not None or row["verified_at"] is not None:
        reasons.append("source has been verified or baselined")
    if row["lease_token"] is not None or row["lease_until"] is not None:
        reasons.append("source has a scan lease")
    if row["last_job_count"] is not None:
        reasons.append("source has a recorded job count")
    for key in ("jobs", "scans", "reviews", "attempts"):
        if row[key]:
            reasons.append(f"source has {key}")
    if row["other_company_sources"]:
        reasons.append("company is shared by another source")
    return reasons


async def prune_sandbox_candidate(
    pool: asyncpg.Pool, *, execute: bool = False
) -> dict[str, Any]:
    """Inspect or atomically delete only the named unused candidate and company."""
    async with pool.acquire() as connection, connection.transaction():
        row = await connection.fetchrow(
            """
            SELECT s.id, s.source_key, s.status, s.origin, s.company_id,
                   s.baseline_completed_at, s.verified_at, s.lease_token,
                   s.lease_until, s.last_job_count,
                   c.name AS company, c.domain, c.registry_key,
                   (SELECT count(*) FROM jobs j WHERE j.source_id = s.id) AS jobs,
                   (SELECT count(*) FROM scan_runs r WHERE r.source_id = s.id) AS scans,
                   (SELECT count(*) FROM source_rollout_reviews r WHERE r.source_id = s.id) AS reviews,
                   (SELECT count(*) FROM source_rollout_attempts a WHERE a.source_id = s.id) AS attempts,
                   (SELECT count(*) FROM job_sources sibling
                    WHERE sibling.company_id = s.company_id AND sibling.id <> s.id)
                     AS other_company_sources
            FROM job_sources s
            JOIN companies c ON c.id = s.company_id
            WHERE s.source_key = $1
            """ + ("FOR UPDATE OF s, c" if execute else ""),
            SANDBOX_SOURCE_KEY,
        )
        if row is None:
            return {"source_key": SANDBOX_SOURCE_KEY, "mode": "execute" if execute else "dry_run",
                    "status": "not_found"}
        snapshot = dict(row)
        reasons = _refusal_reasons(snapshot)
        output: dict[str, Any] = {
            "source_key": SANDBOX_SOURCE_KEY,
            "mode": "execute" if execute else "dry_run",
            "company": snapshot["company"],
            "eligible": not reasons,
            "refusal_reasons": reasons,
            "status": "refused" if reasons else "ready",
        }
        if not execute:
            return output
        if reasons:
            raise RuntimeError("candidate cleanup refused: " + "; ".join(reasons))
        source_result = await connection.execute(
            "DELETE FROM job_sources WHERE id = $1 AND source_key = $2 AND status = 'candidate'",
            snapshot["id"], SANDBOX_SOURCE_KEY,
        )
        if source_result != "DELETE 1":
            raise RuntimeError("candidate changed before deletion")
        company_result = await connection.execute(
            """
            DELETE FROM companies c
            WHERE c.id = $1 AND c.registry_key = $2 AND c.domain IS NULL
              AND NOT EXISTS (SELECT 1 FROM job_sources s WHERE s.company_id = c.id)
            """,
            snapshot["company_id"], SANDBOX_SOURCE_KEY,
        )
        if company_result != "DELETE 1":
            raise RuntimeError("company is no longer orphaned; cleanup rolled back")
        output["status"] = "deleted"
        return output
