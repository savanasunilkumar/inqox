from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any


def utcnow() -> datetime:
    return datetime.now(UTC)


def _json_default(value: object) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)


@dataclass(frozen=True, slots=True)
class Source:
    id: int
    company_id: int
    company_name: str
    domain: str | None
    source_key: str
    rate_limit_key: str
    adapter: str
    identifier: str
    careers_url: str | None
    config: dict[str, Any]
    status: str
    scan_interval_seconds: int
    baseline_completed_at: datetime | None
    last_job_count: int | None
    closure_miss_threshold: int
    lease_token: str | None = None


@dataclass(frozen=True, slots=True)
class NormalizedJob:
    external_id: str
    title: str
    location: str | None
    canonical_url: str
    apply_url: str | None = None
    published_at: datetime | None = None
    description_text: str | None = None
    employment_type: str | None = None
    is_remote: bool | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def stable_payload(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "location": self.location,
            "canonical_url": self.canonical_url,
            "apply_url": self.apply_url,
            "published_at": self.published_at.astimezone(UTC).isoformat()
            if self.published_at
            else None,
            "description_text": self.description_text,
            "employment_type": self.employment_type,
            "is_remote": self.is_remote,
        }

    def content_hash(self) -> str:
        encoded = json.dumps(
            self.stable_payload(), sort_keys=True, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def database_payload(self) -> dict[str, Any]:
        payload = self.stable_payload()
        payload["raw"] = self.raw
        return payload


@dataclass(frozen=True, slots=True)
class ScanResult:
    jobs: tuple[NormalizedJob, ...]
    complete: bool
    expected_count: int | None = None
    page_count: int = 1
    invalid_count: int = 0
    diagnostics: dict[str, Any] = field(default_factory=dict)

    @property
    def unique_count(self) -> int:
        return len(self.jobs)


@dataclass(frozen=True, slots=True)
class ReconcileSummary:
    scan_id: int
    status: str
    baseline: bool
    discovered: int = 0
    updated: int = 0
    reopened: int = 0
    closed: int = 0
    unchanged: int = 0
    matched: int = 0
    reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def job_from_ats(job: Any, *, include_description: bool = False) -> NormalizedJob:
    """Convert an ats-scrapers Job without trusting its cross-tenant global_id."""
    dumped = job.model_dump(mode="json")
    canonical_url = str(job.url)
    ats_id = (job.ats_id or "").strip()
    if not ats_id:
        ats_id = "url:" + hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()
    title = (job.title or "").strip()
    if not title or not canonical_url.startswith(("http://", "https://")):
        raise ValueError("job is missing a title or public HTTP(S) URL")
    posted_at = job.posted_at
    if posted_at is not None and posted_at.tzinfo is None:
        posted_at = posted_at.replace(tzinfo=UTC)
    raw = dumped.get("raw") if include_description else {}
    if not isinstance(raw, dict):
        raw = {}
    return NormalizedJob(
        external_id=ats_id,
        title=title,
        location=(job.location or "").strip() or None,
        canonical_url=canonical_url,
        apply_url=str(job.apply_url) if job.apply_url else None,
        published_at=posted_at,
        description_text=job.description if include_description else None,
        employment_type=job.employment_type,
        is_remote=job.is_remote,
        raw=json.loads(json.dumps(raw, default=_json_default)),
    )
