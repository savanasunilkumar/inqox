from __future__ import annotations

import asyncio
from typing import Any

from .config import Settings
from .models import ScanResult, Source, job_from_ats


class AdapterScanError(RuntimeError):
    pass


# Registry rows are discovery leads, not reviewed source contracts. No bulk
# import is allowed to infer closure automatically; an operator must enable
# `closure_safe` for a particular source after validating its full-snapshot
# semantics. The manually reviewed bootstrap file carries that decision.
CLOSURE_SAFE_ADAPTERS: frozenset[str] = frozenset()


def registry_identifier(adapter: str, slug: str, url: str) -> str:
    """Resolve the identifier shape expected by common ats-scrapers adapters.

    Imported rows remain candidates, so adapters with more specialized config
    can be verified or fixed before activation.
    """
    adapter = adapter.casefold().strip()
    slug = slug.strip()
    url = url.strip()
    if adapter in {"workday", "taleo", "successfactors", "phenom", "adp"}:
        return url or slug
    if adapter == "oracle" and url:
        return url
    if adapter == "icims" and url and ".icims.com" in url:
        return url
    return slug or url


async def scan_source(source: Source, settings: Settings) -> ScanResult:
    # Importing this module registers all upstream adapters. It is intentionally
    # delayed so API/feed processes do not pay scraper import cost.
    from ats_scrapers.scrapers import AshbyScraper, GreenhouseScraper, get_scraper

    class ListedAshbyScraper(AshbyScraper):
        async def afetch(self):
            url = (
                "https://api.ashbyhq.com/posting-api/job-board/"
                f"{self.company_slug}?includeCompensation=true"
            )
            async with self.make_fetcher() as fetch:
                payload = await fetch.get_json(url)
            if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
                raise AdapterScanError("Ashby response is missing its jobs list")
            return [
                self._parse_job(item)
                for item in payload["jobs"]
                if item.get("isListed") is not False
            ]

    class LeanGreenhouseScraper(GreenhouseScraper):
        async def afetch(self):
            url = (
                f"https://boards-api.greenhouse.io/v1/boards/{self.company_slug}/jobs?content=false"
            )
            async with self.make_fetcher() as fetch:
                payload = await fetch.get_json(url)
            if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
                raise AdapterScanError("Greenhouse response is missing its jobs list")
            return [self._parse_job(item) for item in payload["jobs"]]

    kwargs: dict[str, Any] = {
        "timeout": settings.ats_request_timeout_seconds,
        "include_descriptions": bool(source.config.get("include_descriptions", True)),
    }
    proxy = source.config.get("proxy")
    if proxy:
        kwargs["proxy"] = proxy
    if source.adapter == "workday":
        kwargs["max_fetch_seconds"] = settings.workday_max_fetch_seconds
        kwargs["company_name"] = source.company_name

    try:
        if source.adapter == "ashby":
            scraper = ListedAshbyScraper(source.identifier, **kwargs)
        elif source.adapter == "greenhouse" and not kwargs["include_descriptions"]:
            scraper = LeanGreenhouseScraper(source.identifier, **kwargs)
        else:
            scraper = get_scraper(source.adapter, source.identifier, **kwargs)
        upstream_jobs = await scraper.afetch()
    except (asyncio.CancelledError, AdapterScanError):
        raise
    except Exception as exc:
        raise AdapterScanError(f"{source.adapter}:{source.identifier}: {exc}") from exc

    if not isinstance(upstream_jobs, list):
        raise AdapterScanError(f"{source.adapter} returned a non-list snapshot")

    normalized = []
    invalid = 0
    seen: set[str] = set()
    duplicates = 0
    for upstream_job in upstream_jobs:
        try:
            job = job_from_ats(
                upstream_job,
                include_description=bool(source.config.get("include_descriptions", True)),
            )
        except (TypeError, ValueError):
            invalid += 1
            continue
        if job.external_id in seen:
            duplicates += 1
            continue
        seen.add(job.external_id)
        normalized.append(job)

    # A malformed row makes the snapshot unsuitable for closure decisions.
    complete = invalid == 0
    return ScanResult(
        jobs=tuple(normalized),
        complete=complete,
        # The library returns normalized rows, not a uniform provider total.
        # Completeness/closure is therefore controlled by the reviewed
        # per-source `closure_safe` contract rather than a tautological count.
        expected_count=None,
        page_count=1,
        invalid_count=invalid,
        diagnostics={
            "adapter": source.adapter,
            "upstream_count": len(upstream_jobs),
            "duplicate_ids": duplicates,
            "invalid_jobs": invalid,
            "closure_safe": bool(source.config.get("closure_safe", False)),
            "completeness_evidence": "pinned-adapter-full-snapshot-contract"
            if source.config.get("closure_safe", False)
            else "discoveries-only",
        },
    )
