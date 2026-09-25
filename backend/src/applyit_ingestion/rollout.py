"""Deterministic, review-first planning for a larger ATS source catalog.

The hosted companies file is a list of leads. It contains no per-company job
counts, so this module refuses to rank a row until measured signals are supplied.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import ipaddress
import json
import math
import re
import threading
import time
import unicodedata
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .adapters import registry_identifier
from .source_keys import make_source_key

RANKING_VERSION = "job-utility-2026-09-23-v1"
SIX_HOURS = 21_600
STAGE_GATES = {100: (8, 0), 500: (100, 48), 1000: (500, 72)}
SIGNAL_COLUMNS = {
    "source_key", "active_jobs", "target_roles", "recent_jobs_30d",
    "remote_jobs", "target_geography_jobs", "adapter_success_rate", "observed_at",
}
EVIDENCE_COLUMNS = {
    "source_key", "official_domain", "official_careers_url", "reviewer", "reviewed_at",
}


def first_scan_delay(source_key: str) -> int:
    """Spread first scheduled scans reproducibly across the six-hour interval."""
    value = int.from_bytes(hashlib.sha256(source_key.encode()).digest()[:8], "big")
    return 60 + value % (SIX_HOURS - 60)
AGGREGATOR_ADAPTERS = {
    "builtin", "eures", "bundesagentur", "jobbankca", "jobsch", "jobs_cz",
    "seek", "wellfound", "weworkremotely", "ycombinator",
}
AMBIGUOUS_NAMES = {
    "company", "confidential", "confidential company", "stealth", "stealth startup",
    "private company", "unknown", "not disclosed", "multiple companies",
    "jobgether", "jobot", "bjak", "example corp",
}
INTERMEDIARY_NAMES = {
    "pear vc", "mercor", "mthree recruiting portal", "embedding vc", "job board",
}


def is_intermediary_name(name: str) -> bool:
    lowered = name.casefold().strip()
    return lowered in INTERMEDIARY_NAMES or bool(
        re.search(r"\b(?:staffing|recruiting|recruitment|talent)\b", lowered)
    )


def is_ambiguous_employer_name(name: str) -> bool:
    return name.casefold().strip() in AMBIGUOUS_NAMES or bool(
        re.search(
            r"\b(?:jobs|careers|openings|opportunities)$|"
            r"\b(?:job board|job posts|job wrapping|invite-only)\b",
            name,
            re.IGNORECASE,
        )
    )
CANONICAL_SNAPSHOT_HOSTS = {
    "ashby": "jobs.ashbyhq.com",
    "greenhouse": "job-boards.greenhouse.io",
    "lever": "jobs.lever.co",
    "smartrecruiters": "careers.smartrecruiters.com",
    "rippling": "ats.rippling.com",
}
GENERIC_TENANTS = {"careers", "company", "job", "jobs", "openings", "positions"}


@dataclass(frozen=True)
class Candidate:
    source_key: str
    name: str
    adapter: str
    identifier: str
    careers_url: str


def _rows(path: Path, required: set[str]) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise ValueError(f"{path} must contain {', '.join(sorted(required))}")
        return [dict(row) for row in reader]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_registry(path: Path, *, expected_sha256: str | None = None) -> list[Candidate]:
    digest = sha256_file(path)
    if expected_sha256 and digest != expected_sha256.casefold():
        raise ValueError("registry checksum does not match the supplied manifest")
    candidates: dict[str, Candidate] = {}
    for row in _rows(path, {"ats", "name", "slug", "url"}):
        adapter = (row["ats"] or "").strip().casefold()
        name = (row["name"] or "").strip()
        url = (row["url"] or "").strip()
        identifier = registry_identifier(adapter, row["slug"] or "", url)
        if not adapter or not name or not identifier or urlsplit(url).scheme != "https":
            continue
        candidate = Candidate(make_source_key(adapter, identifier), name, adapter, identifier, url)
        prior = candidates.get(candidate.source_key)
        if prior and prior != candidate:
            raise ValueError(f"conflicting registry identity for {candidate.source_key}")
        candidates[candidate.source_key] = candidate
    return list(candidates.values())


def _nonnegative_int(value: str, field: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be an integer") from exc
    if parsed < 0:
        raise ValueError(f"{field} must be nonnegative")
    return parsed


def _instant(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a time zone")
    return parsed.astimezone(UTC)


def load_signals(path: Path) -> dict[str, dict[str, object]]:
    signals: dict[str, dict[str, object]] = {}
    for row in _rows(path, SIGNAL_COLUMNS):
        key = (row["source_key"] or "").strip()
        if not key or key in signals:
            raise ValueError(f"missing or duplicate signal source_key: {key!r}")
        measured = {field: _nonnegative_int(row[field], field) for field in (
            "active_jobs", "target_roles", "recent_jobs_30d", "remote_jobs",
            "target_geography_jobs",
        )}
        if any(measured[field] > measured["active_jobs"] for field in (
            "target_roles", "recent_jobs_30d", "remote_jobs", "target_geography_jobs",
        )):
            raise ValueError(f"signal counts exceed active_jobs for {key}")
        try:
            reliability = float(row["adapter_success_rate"])
        except (TypeError, ValueError) as exc:
            raise ValueError(f"invalid adapter_success_rate for {key}") from exc
        if not math.isfinite(reliability) or not 0 <= reliability <= 1:
            raise ValueError(f"adapter_success_rate must be between zero and one for {key}")
        signals[key] = {
            **measured,
            "adapter_success_rate": reliability,
            "observed_at": _instant(row["observed_at"], "observed_at").isoformat(),
        }
    return signals


def signals_from_snapshot_metrics(
    path: Path, candidates: list[Candidate], *, observed_at: str,
) -> dict[str, dict[str, object]]:
    """Join a job snapshot's ATS/slug counts to exact registry tenants.

    The snapshot has no recency, geography, or scanner reliability fields, so
    those are left neutral rather than invented. A live complete scan still
    gates activation.
    """
    timestamp = _instant(observed_at, "observed_at").isoformat()
    by_tenant: dict[tuple[str, str], list[Candidate]] = {}
    for candidate in candidates:
        if (
            candidate.adapter in CANONICAL_SNAPSHOT_HOSTS
            and urlsplit(candidate.careers_url).hostname
            == CANONICAL_SNAPSHOT_HOSTS[candidate.adapter]
            and candidate.identifier.casefold() not in GENERIC_TENANTS
        ):
            by_tenant.setdefault(
                (candidate.adapter, candidate.identifier.casefold()), []
            ).append(candidate)
    result: dict[str, dict[str, object]] = {}
    seen: set[tuple[str, str]] = set()
    for row in _rows(path, {"ats", "slug", "total_jobs", "relevant_jobs"}):
        tenant = ((row["ats"] or "").strip().casefold(), (row["slug"] or "").strip().casefold())
        if not tenant[1] or tenant[1] in GENERIC_TENANTS or tenant in seen:
            continue
        seen.add(tenant)
        matches = by_tenant.get(tenant, [])
        if len(matches) != 1:
            continue
        total = _nonnegative_int(row["total_jobs"], "total_jobs")
        relevant = _nonnegative_int(row["relevant_jobs"], "relevant_jobs")
        if relevant > total:
            raise ValueError(f"snapshot relevant_jobs exceeds total_jobs for {tenant}")
        result[matches[0].source_key] = {
            "active_jobs": total,
            "target_roles": relevant,
            "recent_jobs_30d": 0,
            "remote_jobs": 0,
            "target_geography_jobs": 0,
            "adapter_success_rate": None,
            "observed_at": timestamp,
            "signal_origin": "hosted_job_snapshot",
        }
    return result


def score_signals(signal: dict[str, object]) -> float:
    """Score job-seeker utility; board size has a logarithmic cap."""
    active = int(signal["active_jobs"])
    return round(
        12 * min(int(signal["target_roles"]), 30)
        + 8 * math.log1p(min(active, 500))
        + 3 * min(int(signal["recent_jobs_30d"]), 30)
        + 2 * min(int(signal["remote_jobs"]), 20)
        + 2 * min(int(signal["target_geography_jobs"]), 20)
        + 40 * float(signal.get("adapter_success_rate") or 0),
        3,
    )


def build_plan(
    candidates: list[Candidate],
    signals: dict[str, dict[str, object]],
    *,
    registry_sha256: str,
    signals_sha256: str,
    target: int = 1000,
    candidate_pool: int | None = None,
    min_target_roles: int = 5,
    max_board_jobs: int = 250,
    max_estimated_jobs: int = 100_000,
    now: datetime | None = None,
) -> dict[str, object]:
    if target not in STAGE_GATES:
        raise ValueError("target must be 100, 500, or 1000")
    if not 1 <= min_target_roles <= 30:
        raise ValueError("min_target_roles must be between 1 and 30")
    candidate_pool = candidate_pool or target * 3
    if candidate_pool < target or candidate_pool > 5000:
        raise ValueError("candidate_pool must be between target and 5000")
    now = (now or datetime.now(UTC)).astimezone(UTC)
    names = Counter(re.sub(r"\W+", "", c.name.casefold()) for c in candidates)
    ranked: list[dict[str, object]] = []
    review: list[dict[str, str]] = []
    for candidate in candidates:
        signal = signals.get(candidate.source_key)
        reason = None
        if candidate.adapter in AGGREGATOR_ADAPTERS:
            reason = "aggregator_or_non_employer_source"
        elif is_ambiguous_employer_name(candidate.name):
            reason = "generic_or_aggregator_company_name"
        elif is_intermediary_name(candidate.name):
            reason = "staffing_or_portfolio_job_board"
        elif names[re.sub(r"\W+", "", candidate.name.casefold())] > 1:
            reason = "duplicate_company_name_requires_identity_review"
        elif signal is None:
            reason = "no_measured_job_signals"
        elif int(signal["target_roles"]) < min_target_roles:
            reason = "fewer_than_required_relevant_jobs"
        elif _instant(str(signal["observed_at"]), "observed_at") < now - timedelta(days=7):
            reason = "stale_job_signals"
        elif _instant(str(signal["observed_at"]), "observed_at") > now + timedelta(minutes=5):
            reason = "future_job_signals"
        elif int(signal["active_jobs"]) > max_board_jobs:
            reason = "board_too_large_for_current_database_budget"
        elif signal.get("adapter_success_rate") is not None and float(signal["adapter_success_rate"]) < 0.95:
            reason = "adapter_reliability_below_95_percent"
        if reason:
            review.append({"source_key": candidate.source_key, "name": candidate.name, "reason": reason})
            continue
        ranked.append({**asdict(candidate), "score": score_signals(signal), "signals": signal})

    ranked.sort(key=lambda row: (-float(row["score"]), str(row["source_key"])))
    selected: list[dict[str, object]] = []
    estimated = 0
    for item in ranked:
        count = int(item["signals"]["active_jobs"])
        if len(selected) < target and estimated + count > max_estimated_jobs:
            review.append({
                "source_key": str(item["source_key"]),
                "name": str(item["name"]),
                "reason": "cumulative_job_budget_exceeded",
            })
            continue
        if len(selected) < candidate_pool:
            selected.append(item)
            if len(selected) <= target:
                estimated += count
    return {
        "version": RANKING_VERSION,
        "created_at": now.isoformat(),
        "registry_sha256": registry_sha256,
        "signals_sha256": signals_sha256,
        "target": target,
        "candidate_pool": candidate_pool,
        "min_target_roles": min_target_roles,
        "max_board_jobs": max_board_jobs,
        "max_estimated_jobs": max_estimated_jobs,
        "estimated_selected_jobs": estimated,
        "selected": selected,
        "review_queue": review,
        "unranked_count": len(candidates) - len(ranked),
    }


def _public_https(url: str) -> bool:
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or not host or host.endswith((".local", ".localhost")):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return "." in host and not host.endswith(".internal")


def _within_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def _matches_board(link: str, board: str) -> bool:
    source = urlsplit(board)
    target = urlsplit(link)
    if target.scheme != "https" or target.hostname != source.hostname:
        return False
    board_path = source.path.rstrip("/")
    if not board_path or not (target.path == board_path or target.path.startswith(board_path + "/")):
        return False
    # Query parameters can carry tenant identity (for example ADP). Do not
    # accept a same-host/same-path link to a different tenant.
    return not source.query or source.query == target.query


def _normalized_name(value: str) -> str:
    plain = unicodedata.normalize("NFKD", html.unescape(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", plain.casefold())


def _brand_from_title(value: str) -> str:
    first = re.split(r"\s+[|–—]\s+", value.strip())[0]
    first = re.sub(
        r"^(?:careers?|jobs?|open roles|opportunities)\s+(?:at|with)\s+",
        "", first, flags=re.IGNORECASE,
    )
    first = re.sub(
        r"\s+(?:careers?|jobs?|open roles|job opportunities)(?:\s*&\s*jobs?)?$",
        "", first, flags=re.IGNORECASE,
    )
    return first.strip(" -|—–")


class _BoardTitle(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_title = False
        self.title: list[str] = []
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            values = dict(attrs)
            key = (values.get("property") or values.get("name") or "").casefold()
            if key in {"og:title", "twitter:title"}:
                self.meta[key] = html.unescape(values.get("content") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self.in_title = False

    def handle_data(self, value: str) -> None:
        if self.in_title:
            self.title.append(value)


def check_live_ats_metadata(item: dict[str, object]) -> tuple[bool, dict[str, str]]:
    """Check a fresh ATS-owned board name against the expected employer name.

    This is an independent live response, not the registry/snapshot company field.
    Generic, short, mismatched, and unavailable names always go to review.
    """
    adapter = str(item["adapter"])
    identifier = str(item["identifier"])
    board_url = str(item["careers_url"])
    expected = str(item["name"])
    parsed = urlsplit(board_url)
    expected_path = f"/{identifier}/jobs" if adapter == "rippling" else f"/{identifier}"
    if (
        adapter not in CANONICAL_SNAPSHOT_HOSTS
        or parsed.hostname != CANONICAL_SNAPSHOT_HOSTS[adapter]
        or parsed.path.rstrip("/") != expected_path
        or not _public_https(board_url)
        or identifier.casefold() in GENERIC_TENANTS
        or is_ambiguous_employer_name(expected)
        or len(_normalized_name(expected)) < 4
    ):
        return False, {"reason": "ambiguous_or_noncanonical_ats_tenant"}
    metadata_url = _ats_metadata_url(item)
    try:
        opener = build_opener(_HttpsRedirects())
        request = Request(metadata_url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; ApplyItSourceReview/1.0)",
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
        })
        with opener.open(request, timeout=15) as response:
            final_url = response.geturl()
            payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                return False, {"reason": "ats_metadata_too_large"}
        requested = urlsplit(metadata_url)
        final = urlsplit(final_url)
        if (
            final.scheme != "https" or final.hostname != requested.hostname
            or final.path.rstrip("/") != requested.path.rstrip("/")
            or final.query != requested.query
        ):
            return False, {"reason": "ats_metadata_redirected_to_different_tenant"}
        if adapter == "greenhouse":
            observed = str(json.loads(payload).get("name") or "")
            kind = "greenhouse_board_api_name"
        elif adapter == "smartrecruiters":
            postings = json.loads(payload).get("content") or []
            company = postings[0].get("company") or {} if postings else {}
            if str(company.get("identifier") or "").casefold() != identifier.casefold():
                return False, {"reason": "ats_posting_tenant_mismatch"}
            observed = str(company.get("name") or "")
            kind = "smartrecruiters_postings_company_name"
        else:
            parser = _BoardTitle()
            parser.feed(payload.decode("utf-8", errors="replace"))
            observed = parser.meta.get("og:title") or parser.meta.get("twitter:title") or "".join(parser.title)
            kind = "ats_board_html_title"
    except Exception as exc:  # noqa: BLE001 - untrusted ATS endpoint must enter review queue
        return False, {"reason": f"ats_metadata_request_failed:{type(exc).__name__}"}
    brand = _brand_from_title(observed)
    evidence = {
        "metadata_url": metadata_url,
        "observed_url": final_url,
        "observed_name": observed[:300],
        "evidence_kind": kind,
        "response_sha256": hashlib.sha256(payload).hexdigest(),
    }
    if not observed:
        return False, {**evidence, "reason": "ats_board_name_missing"}
    if _normalized_name(brand) != _normalized_name(expected):
        return False, {**evidence, "reason": "ats_board_name_mismatch"}
    return True, evidence


def _ats_metadata_url(item: dict[str, object]) -> str:
    adapter = str(item["adapter"])
    slug = quote(str(item["identifier"]), safe="")
    board_url = str(item["careers_url"])
    if adapter == "greenhouse":
        return f"https://boards-api.greenhouse.io/v1/boards/{slug}"
    if adapter == "smartrecruiters":
        return f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=1"
    if adapter == "rippling":
        return board_url.rstrip("/") if board_url.rstrip("/").endswith("/jobs") else board_url.rstrip("/") + "/jobs"
    return board_url


class _Links(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.hrefs.append(href)


class _HttpsRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if not _public_https(newurl):
            raise ValueError("careers page redirected to a nonpublic or non-HTTPS URL")
        return super().redirect_request(request, fp, code, msg, headers, newurl)


def check_official_careers_link(official_url: str, board_url: str) -> tuple[bool, str]:
    if not _public_https(official_url) or not _public_https(board_url):
        return False, "careers or ATS URL is not public HTTPS"
    opener = build_opener(_HttpsRedirects())
    try:
        with opener.open(Request(official_url, headers={"User-Agent": "ApplyItSourceReview/1.0"}), timeout=15) as response:
            final_url = response.geturl()
            if _matches_board(final_url, board_url):
                return True, final_url
            payload = response.read(2_000_001)
            if len(payload) > 2_000_000:
                return False, "careers page exceeds review size limit"
            links = _Links()
            links.feed(payload.decode("utf-8", errors="replace"))
            for href in links.hrefs:
                resolved = urljoin(final_url, href)
                if _matches_board(resolved, board_url):
                    return True, resolved
    except Exception as exc:  # noqa: BLE001 - site failures must enter review queue
        return False, f"careers page check failed: {type(exc).__name__}: {exc}"
    return False, "official careers page does not link to this exact ATS tenant"


def review_plan(
    plan: dict[str, object], evidence_path: Path, *, workers: int = 4,
    now: datetime | None = None,
) -> dict[str, object]:
    if plan.get("version") != RANKING_VERSION:
        raise ValueError("ranking version is unsupported")
    if workers < 1 or workers > 8:
        raise ValueError("workers must be between 1 and 8")
    now = now or datetime.now(UTC)
    evidence: dict[str, dict[str, str]] = {}
    for row in _rows(evidence_path, EVIDENCE_COLUMNS):
        key = (row["source_key"] or "").strip()
        if not key or key in evidence:
            raise ValueError(f"missing or duplicate identity evidence for {key!r}")
        evidence[key] = row
    domain_counts = Counter(
        (row["official_domain"] or "").strip().casefold()
        for row in evidence.values()
        if (row["official_domain"] or "").strip()
    )

    def examine(item: dict[str, object]) -> tuple[dict[str, object] | None, dict[str, str] | None]:
        key = str(item["source_key"])
        row = evidence.get(key)
        if not row:
            return None, {"source_key": key, "reason": "identity_evidence_missing"}
        domain = (row["official_domain"] or "").strip().casefold()
        if domain_counts[domain] > 1:
            return None, {"source_key": key, "reason": "duplicate_official_domain_requires_review"}
        official_url = (row["official_careers_url"] or "").strip()
        reviewer = (row["reviewer"] or "").strip()
        try:
            reviewed_at = _instant(row["reviewed_at"], "reviewed_at")
        except ValueError:
            return None, {"source_key": key, "reason": "invalid_review_timestamp"}
        host = urlsplit(official_url).hostname or ""
        if (
            not reviewer or not domain or not _public_https("https://" + domain)
            or not _public_https(official_url) or not _within_domain(host, domain)
            or reviewed_at > now or reviewed_at < now - timedelta(days=7)
        ):
            return None, {"source_key": key, "reason": "official_domain_or_review_invalid"}
        if _within_domain(urlsplit(str(item["careers_url"])).hostname or "", domain):
            return None, {"source_key": key, "reason": "ATS URL is not a separately identified tenant"}
        verified, detail = check_official_careers_link(official_url, str(item["careers_url"]))
        if not verified:
            return None, {"source_key": key, "reason": detail}
        approved = dict(item)
        approved["identity"] = {
            "evidence_type": "official_careers_link",
            "official_domain": domain,
            "official_careers_url": official_url,
            "linked_ats_url": detail,
            "reviewer": reviewer,
            "reviewed_at": reviewed_at.isoformat(),
            "checked_at": now.astimezone(UTC).isoformat(),
        }
        return approved, None

    with ThreadPoolExecutor(max_workers=workers) as executor:
        outcomes = list(executor.map(examine, plan["selected"]))
    return {
        **{key: value for key, value in plan.items() if key not in {"selected", "review_queue"}},
        "ranking_review_queue_count": len(plan.get("review_queue", [])),
        "identity_checked_at": now.astimezone(UTC).isoformat(),
        "approved": [approved for approved, _ in outcomes if approved],
        "identity_review_queue": [pending for _, pending in outcomes if pending],
    }


def review_plan_live_metadata(
    plan: dict[str, object], *, workers: int = 8, now: datetime | None = None,
) -> dict[str, object]:
    """Recheck ATS-owned public metadata and queue every ambiguous board."""
    if plan.get("version") != RANKING_VERSION:
        raise ValueError("ranking version is unsupported")
    if workers < 1 or workers > 8:
        raise ValueError("workers must be between 1 and 8")
    now = (now or datetime.now(UTC)).astimezone(UTC)
    locks = {adapter: threading.Lock() for adapter in CANONICAL_SNAPSHOT_HOSTS}
    next_allowed = {adapter: 0.0 for adapter in CANONICAL_SNAPSHOT_HOSTS}
    spacing = {"greenhouse": 0.10, "ashby": 0.15, "lever": 0.15,
               "smartrecruiters": 0.15, "rippling": 0.50}

    def examine(item: dict[str, object]) -> tuple[dict[str, object] | None, dict[str, str] | None]:
        adapter = str(item["adapter"])
        if is_intermediary_name(str(item["name"])):
            return None, {"source_key": str(item["source_key"]), "reason": "staffing_or_portfolio_job_board"}
        if adapter not in locks:
            return None, {"source_key": str(item["source_key"]), "reason": "unsupported_ats_metadata"}
        with locks[adapter]:
            delay = next_allowed[adapter] - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            next_allowed[adapter] = time.monotonic() + spacing[adapter]
        passed, evidence = check_live_ats_metadata(item)
        if not passed:
            return None, {
                "source_key": str(item["source_key"]),
                "reason": evidence.get("reason", "ats_metadata_inconclusive"),
            }
        approved = dict(item)
        approved["identity"] = {
            "evidence_type": "ats_live_metadata",
            "reviewer": "automated-exact-name-check",
            "reviewed_at": now.isoformat(),
            "checked_at": now.isoformat(),
            **evidence,
        }
        return approved, None

    with ThreadPoolExecutor(max_workers=workers) as executor:
        outcomes = list(executor.map(examine, plan["selected"]))
    return {
        **{key: value for key, value in plan.items() if key not in {"selected", "review_queue"}},
        "ranking_review_queue_count": len(plan.get("review_queue", [])),
        "identity_checked_at": now.isoformat(),
        "approved": [approved for approved, _ in outcomes if approved],
        "identity_review_queue": [pending for _, pending in outcomes if pending],
    }


def review_plan_from_ats_report(
    plan: dict[str, object], report_path: Path, *, now: datetime | None = None,
) -> dict[str, object]:
    """Use a fresh independent live-ATS report; activation checks it again."""
    if plan.get("version") != RANKING_VERSION:
        raise ValueError("ranking version is unsupported")
    now = (now or datetime.now(UTC)).astimezone(UTC)
    observed_at = datetime.fromtimestamp(report_path.stat().st_mtime, UTC)
    if observed_at > now + timedelta(minutes=5) or observed_at < now - timedelta(hours=2):
        raise ValueError("ATS metadata report is stale or future-dated")
    required = {
        "ats", "name", "slug", "url", "board_metadata_url", "board_name_or_title",
        "evidence_kind", "identity_status", "identity_reason", "final_url",
        "http_status", "checked_at_utc",
    }
    reports: dict[str, dict[str, str]] = {}
    duplicates: set[str] = set()
    for row in _rows(report_path, required):
        adapter = (row["ats"] or "").strip().casefold()
        identifier = registry_identifier(adapter, row["slug"] or "", row["url"] or "")
        key = make_source_key(adapter, identifier)
        if key in reports:
            duplicates.add(key)
        reports[key] = row
    report_sha = sha256_file(report_path)
    approved: list[dict[str, object]] = []
    pending: list[dict[str, str]] = []
    for item in plan["selected"]:
        key = str(item["source_key"])
        row = reports.get(key)
        reason = None
        if key in duplicates:
            reason = "duplicate_ats_report_identity"
        elif is_intermediary_name(str(item["name"])):
            reason = "staffing_or_portfolio_job_board"
        elif not row:
            reason = "ats_report_missing"
        elif (
            row["identity_status"] != "pass"
            or row["identity_reason"] != "exact_normalized_employer_name_and_canonical_final_url"
        ):
            reason = row.get("identity_reason") or "ats_report_inconclusive"
        elif (
            row["name"] != item["name"] or row["ats"] != item["adapter"]
            or row["url"] != item["careers_url"]
            or row["board_metadata_url"] != _ats_metadata_url(item)
            or row["final_url"] != row["board_metadata_url"]
            or row["http_status"] != "200"
            or not _public_https(row["board_metadata_url"])
            or _instant(row["checked_at_utc"], "checked_at_utc") < now - timedelta(hours=2)
            or len(_normalized_name(str(item["name"]))) < 4
            or _normalized_name(_brand_from_title(row["board_name_or_title"]))
            != _normalized_name(str(item["name"]))
            or int(item["signals"]["target_roles"]) < int(plan.get("min_target_roles", 5))
        ):
            reason = "ats_report_does_not_match_ranked_tenant"
        if reason:
            pending.append({"source_key": key, "reason": reason})
            continue
        reviewed = dict(item)
        reviewed["identity"] = {
            "evidence_type": "ats_live_metadata",
            "reviewer": "automated-exact-name-check",
            "reviewed_at": row["checked_at_utc"],
            "checked_at": row["checked_at_utc"],
            "metadata_url": row["board_metadata_url"],
            "observed_url": row["final_url"],
            "observed_name": row["board_name_or_title"][:300],
            "evidence_kind": row["evidence_kind"],
            "report_sha256": report_sha,
        }
        approved.append(reviewed)
    return {
        **{key: value for key, value in plan.items() if key not in {"selected", "review_queue"}},
        "ranking_review_queue_count": len(plan.get("review_queue", [])),
        "identity_checked_at": observed_at.isoformat(),
        "approved": approved,
        "identity_review_queue": pending,
    }


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m applyit_ingestion.rollout")
    sub = parser.add_subparsers(dest="command", required=True)
    plan = sub.add_parser("plan", help="rank measured registry sources without activating them")
    plan.add_argument("--registry", type=Path, required=True)
    plan.add_argument("--registry-sha256", required=True)
    data = plan.add_mutually_exclusive_group(required=True)
    data.add_argument("--signals", type=Path)
    data.add_argument("--snapshot-metrics", type=Path)
    plan.add_argument("--snapshot-at", help="ISO time from the snapshot manifest")
    plan.add_argument("--target", type=int, choices=tuple(STAGE_GATES), default=1000)
    plan.add_argument("--candidate-pool", type=int, default=None)
    plan.add_argument("--min-target-roles", type=int, default=5)
    plan.add_argument("--max-board-jobs", type=int, default=250)
    plan.add_argument("--max-estimated-jobs", type=int, default=100_000)
    plan.add_argument("--output", type=Path, required=True)
    review = sub.add_parser("review", help="check curated official-careers links to ATS tenants")
    review.add_argument("--plan", type=Path, required=True)
    review.add_argument("--mode", choices=("official-links", "ats-metadata", "ats-report"), default="ats-metadata")
    review.add_argument("--evidence", type=Path, help="reviewed domain CSV for official-links mode")
    review.add_argument("--report", type=Path, help="fresh live ATS metadata report for ats-report mode")
    review.add_argument("--workers", type=int, default=4)
    review.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "plan":
        if args.max_board_jobs < 1 or args.max_estimated_jobs < 1:
            parser.error("job budgets must be positive")
        candidates = load_registry(args.registry, expected_sha256=args.registry_sha256)
        if args.snapshot_metrics:
            if not args.snapshot_at:
                parser.error("--snapshot-at is required with --snapshot-metrics")
            signal_path = args.snapshot_metrics
            signals = signals_from_snapshot_metrics(
                signal_path, candidates, observed_at=args.snapshot_at
            )
        else:
            signal_path = args.signals
            signals = load_signals(signal_path)
        payload = build_plan(
            candidates,
            signals,
            registry_sha256=sha256_file(args.registry),
            signals_sha256=sha256_file(signal_path),
            target=args.target,
            candidate_pool=args.candidate_pool,
            min_target_roles=args.min_target_roles,
            max_board_jobs=args.max_board_jobs,
            max_estimated_jobs=args.max_estimated_jobs,
        )
        write_json(args.output, payload)
        print(json.dumps({
            "selected": len(payload["selected"]),
            "review_queue": len(payload["review_queue"]),
            "estimated_selected_jobs": payload["estimated_selected_jobs"],
            "output": str(args.output),
        }, sort_keys=True))
    else:
        payload = json.loads(args.plan.read_text(encoding="utf-8"))
        if args.mode == "official-links":
            if args.evidence is None:
                parser.error("--evidence is required for official-links mode")
            reviewed = review_plan(payload, args.evidence, workers=args.workers)
        elif args.mode == "ats-report":
            if args.report is None:
                parser.error("--report is required for ats-report mode")
            reviewed = review_plan_from_ats_report(payload, args.report)
        else:
            reviewed = review_plan_live_metadata(payload, workers=args.workers)
        write_json(args.output, reviewed)
        print(json.dumps({
            "approved": len(reviewed["approved"]),
            "identity_review_queue": len(reviewed["identity_review_queue"]),
            "output": str(args.output),
        }, sort_keys=True))


if __name__ == "__main__":
    main()
