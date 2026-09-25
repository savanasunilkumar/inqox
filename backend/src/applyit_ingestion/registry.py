from __future__ import annotations

import csv
import hashlib
import io
import json
import secrets
from dataclasses import dataclass

import asyncpg
import httpx

from .adapters import CLOSURE_SAFE_ADAPTERS, registry_identifier
from .repository import make_rate_limit_key, make_source_key, rate_limit_policy


@dataclass(frozen=True, slots=True)
class ImportSummary:
    read: int
    inserted: int
    existing: int
    skipped: int


async def import_hosted_registry(
    pool: asyncpg.Pool,
    url: str,
    *,
    limit: int | None = None,
    allowed_source_keys: set[str] | None = None,
    expected_registry_sha256: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> ImportSummary:
    if limit is not None and allowed_source_keys is not None:
        raise ValueError("limit and allowed_source_keys cannot be combined")
    if not url.startswith("https://"):
        raise ValueError("registry URL must use HTTPS")
    async with httpx.AsyncClient(timeout=120, follow_redirects=True, transport=transport) as client:
        expected_sha256 = None
        expected_rows = None
        origin_ref = url
        if url.endswith(".json"):
            manifest_response = await client.get(url)
            manifest_response.raise_for_status()
            if manifest_response.url.scheme != "https":
                raise ValueError("registry manifest redirected away from HTTPS")
            manifest = manifest_response.json()
            companies = manifest.get("companies") if isinstance(manifest, dict) else None
            if not isinstance(companies, dict):
                raise ValueError("registry manifest is missing its companies object")
            url = str(companies.get("csv") or "")
            expected_sha256 = str(companies.get("sha256") or "") or None
            expected_rows = companies.get("rows")
            if not url.startswith("https://"):
                raise ValueError("manifest companies.csv URL must use HTTPS")

        response = await client.get(url)
        response.raise_for_status()
        if response.url.scheme != "https":
            raise ValueError("registry CSV redirected away from HTTPS")
        if len(response.content) > 25_000_000:
            raise ValueError("registry response exceeds 25 MB safety limit")
    actual_sha256 = hashlib.sha256(response.content).hexdigest()
    if expected_registry_sha256 and not secrets.compare_digest(
        actual_sha256, expected_registry_sha256.casefold()
    ):
        raise ValueError("registry changed since the reviewed rollout plan was created")
    if expected_sha256 and not secrets.compare_digest(actual_sha256, expected_sha256):
        raise ValueError(
            f"registry checksum mismatch: expected {expected_sha256}, got {actual_sha256}"
        )
    reader = csv.DictReader(io.StringIO(response.text))
    required = {"ats", "name", "slug", "url"}
    if not reader.fieldnames or not required.issubset(reader.fieldnames):
        raise ValueError("registry must have ats,name,slug,url columns")
    registry_rows = list(reader)
    if expected_rows is not None and len(registry_rows) != int(expected_rows):
        raise ValueError(
            f"registry row mismatch: expected {expected_rows}, read {len(registry_rows)}"
        )
    selected_rows = registry_rows[:limit] if limit is not None else registry_rows

    read = 0
    skipped = 0
    matched_source_keys: set[str] = set()
    staged: dict[str, tuple[str, str, str, str, str, str, int, int, bool, str]] = {}
    for row in selected_rows:
        adapter = (row.get("ats") or "").strip().casefold()
        name = (row.get("name") or "").strip()
        slug = (row.get("slug") or "").strip()
        url_value = (row.get("url") or "").strip()
        identifier = registry_identifier(adapter, slug, url_value)
        if not adapter or not name or not identifier:
            skipped += 1
            continue
        source_key = make_source_key(adapter, identifier)
        if allowed_source_keys is not None:
            if source_key not in allowed_source_keys:
                continue
            matched_source_keys.add(source_key)
        read += 1
        if source_key in staged:
            skipped += 1
            continue
        min_spacing_ms, max_concurrency = rate_limit_policy(adapter)
        staged[source_key] = (
            name,
            source_key,
            make_rate_limit_key(adapter, identifier, url_value or None),
            adapter,
            identifier,
            url_value,
            min_spacing_ms,
            max_concurrency,
            adapter in CLOSURE_SAFE_ADAPTERS,
            json.dumps(dict(row), ensure_ascii=False, separators=(",", ":")),
        )

    if allowed_source_keys is not None and matched_source_keys != allowed_source_keys:
        missing = allowed_source_keys - matched_source_keys
        raise ValueError(f"reviewed plan contains {len(missing)} sources absent from registry")

    if not staged:
        return ImportSummary(read, 0, 0, skipped)

    async with pool.acquire() as connection, connection.transaction():
        await connection.execute(
            """
            CREATE TEMP TABLE registry_import_stage (
              name text NOT NULL,
              source_key text PRIMARY KEY,
              rate_limit_key text NOT NULL,
              adapter text NOT NULL,
              identifier text NOT NULL,
              careers_url text NOT NULL,
              min_spacing_ms integer NOT NULL,
              max_concurrency smallint NOT NULL,
              closure_safe boolean NOT NULL,
              payload_text text NOT NULL
            ) ON COMMIT DROP
            """
        )
        await connection.copy_records_to_table(
            "registry_import_stage",
            records=staged.values(),
            columns=(
                "name",
                "source_key",
                "rate_limit_key",
                "adapter",
                "identifier",
                "careers_url",
                "min_spacing_ms",
                "max_concurrency",
                "closure_safe",
                "payload_text",
            ),
        )
        # Repair source keys produced by the earlier whole-string lowercase
        # normalizer before counting/inserting the staged registry rows.
        await connection.execute(
            """
            UPDATE job_sources source SET source_key = stage.source_key, updated_at = now()
            FROM registry_import_stage stage
            WHERE source.adapter = stage.adapter
              AND source.config->>'identifier' = stage.identifier
              AND source.source_key <> stage.source_key
              AND NOT EXISTS (
                SELECT 1 FROM job_sources target WHERE target.source_key = stage.source_key
              )
            """
        )
        existing = await connection.fetchval(
            """
            SELECT count(*) FROM registry_import_stage stage
            JOIN job_sources source ON source.source_key = stage.source_key
            """
        )
        await connection.execute(
            """
            INSERT INTO source_rate_limits(
              rate_limit_key, min_spacing_ms, max_concurrency
            )
            SELECT DISTINCT rate_limit_key, min_spacing_ms, max_concurrency
            FROM registry_import_stage
            ON CONFLICT (rate_limit_key) DO UPDATE SET
              min_spacing_ms = EXCLUDED.min_spacing_ms,
              max_concurrency = EXCLUDED.max_concurrency,
              updated_at = now()
            """
        )
        await connection.execute(
            """
            INSERT INTO companies(name, metadata, registry_key)
            SELECT stage.name, jsonb_build_object('registry_name', stage.name), stage.source_key
            FROM registry_import_stage stage
            LEFT JOIN job_sources source ON source.source_key = stage.source_key
            WHERE source.id IS NULL
            ON CONFLICT (registry_key) WHERE registry_key IS NOT NULL DO UPDATE SET
              name = EXCLUDED.name,
              metadata = companies.metadata || EXCLUDED.metadata,
              updated_at = now()
            """
        )
        await connection.execute(
            """
            UPDATE job_sources source SET
              origin_ref = $1,
              origin_payload = stage.payload_text::jsonb,
              updated_at = now()
            FROM registry_import_stage stage
            WHERE source.source_key = stage.source_key
            """,
            origin_ref,
        )
        insert_result = await connection.execute(
            """
            INSERT INTO job_sources(
              company_id, source_key, rate_limit_key, adapter, config, careers_url,
              status, origin, origin_license, origin_ref, origin_payload
            )
            SELECT company.id, stage.source_key, stage.rate_limit_key, stage.adapter,
              jsonb_build_object(
                'identifier', stage.identifier,
                'include_descriptions', true,
                'closure_safe', stage.closure_safe
              ),
              NULLIF(stage.careers_url, ''), 'candidate',
              'ats-scrapers-hosted-registry', 'MIT-code-registry-only', $1,
              stage.payload_text::jsonb
            FROM registry_import_stage stage
            JOIN companies company ON company.registry_key = stage.source_key
            ON CONFLICT (source_key) DO NOTHING
            """,
            origin_ref,
        )
        inserted = int(insert_result.rsplit(" ", 1)[-1])
    return ImportSummary(read, inserted, existing, skipped)
