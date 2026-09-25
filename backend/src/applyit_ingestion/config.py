from __future__ import annotations

import os
from dataclasses import dataclass


def _csv_env(name: str, default: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in os.getenv(name, default).split(",") if part.strip())


def _int_env(name: str, default: int) -> int:
    return int(os.getenv(name, str(default)))


def _float_env(name: str, default: float) -> float:
    return float(os.getenv(name, str(default)))


@dataclass(frozen=True, slots=True)
class Settings:
    database_url: str
    api_host: str
    api_port: int
    api_token: str | None
    feed_limit: int
    watch_keywords: tuple[str, ...]
    watch_excludes: tuple[str, ...]
    scanner_idle_seconds: int
    source_lease_seconds: int
    count_collapse_ratio: float
    count_collapse_min_prior: int
    default_scan_interval_seconds: int
    notifier_idle_seconds: int
    notifier_max_attempts: int
    ntfy_base_url: str
    ntfy_topic: str | None
    ntfy_token: str | None
    ats_request_timeout_seconds: float
    source_scan_timeout_seconds: float
    workday_max_fetch_seconds: float
    registry_manifest_url: str

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_url=os.getenv(
                "DATABASE_URL", "postgresql://applyit:applyit@localhost:5432/applyit"
            ),
            api_host=os.getenv("API_HOST", "127.0.0.1"),
            api_port=_int_env("API_PORT", 8080),
            api_token=os.getenv("API_TOKEN") or None,
            feed_limit=min(max(_int_env("FEED_LIMIT", 200), 1), 1000),
            watch_keywords=_csv_env(
                "WATCH_KEYWORDS",
                "software engineer,frontend,front-end,front end,backend,full stack,"
                "full-stack,fullstack,product engineer,design engineer,web developer,"
                "mobile engineer,android developer,ios engineer,data engineer,"
                "machine learning engineer,ml engineer,infrastructure engineer,"
                "platform engineer,devops engineer,site reliability engineer",
            ),
            watch_excludes=_csv_env("WATCH_EXCLUDES", "intern,internship"),
            scanner_idle_seconds=_int_env("SCANNER_IDLE_SECONDS", 2),
            source_lease_seconds=_int_env("SOURCE_LEASE_SECONDS", 1800),
            count_collapse_ratio=_float_env("COUNT_COLLAPSE_RATIO", 0.20),
            count_collapse_min_prior=_int_env("COUNT_COLLAPSE_MIN_PRIOR", 25),
            default_scan_interval_seconds=_int_env("DEFAULT_SCAN_INTERVAL_SECONDS", 3600),
            notifier_idle_seconds=_int_env("NOTIFIER_IDLE_SECONDS", 5),
            notifier_max_attempts=_int_env("NOTIFIER_MAX_ATTEMPTS", 8),
            ntfy_base_url=os.getenv("NTFY_BASE_URL", "https://ntfy.sh").rstrip("/"),
            ntfy_topic=os.getenv("NTFY_TOPIC") or None,
            ntfy_token=os.getenv("NTFY_TOKEN") or None,
            ats_request_timeout_seconds=_float_env("ATS_REQUEST_TIMEOUT_SECONDS", 45),
            source_scan_timeout_seconds=_float_env("SOURCE_SCAN_TIMEOUT_SECONDS", 1200),
            workday_max_fetch_seconds=_float_env("WORKDAY_MAX_FETCH_SECONDS", 900),
            registry_manifest_url=os.getenv(
                "REGISTRY_MANIFEST_URL",
                "https://storage.stapply.ai/jobhive/v1/manifest.json",
            ),
        )
