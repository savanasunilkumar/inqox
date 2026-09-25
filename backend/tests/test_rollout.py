from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from applyit_ingestion.rollout import (
    Candidate,
    _matches_board,
    build_plan,
    first_scan_delay,
    is_ambiguous_employer_name,
    is_intermediary_name,
    load_registry,
    review_plan,
    signals_from_snapshot_metrics,
)

NOW = datetime(2026, 9, 23, 12, tzinfo=UTC)


def _signal(jobs: int, roles: int) -> dict[str, object]:
    return {
        "active_jobs": jobs,
        "target_roles": roles,
        "recent_jobs_30d": 0,
        "remote_jobs": 0,
        "target_geography_jobs": 0,
        "adapter_success_rate": None,
        "observed_at": "2026-09-22T12:00:00+00:00",
    }


def test_registry_checksum_and_case_sensitive_source_keys(tmp_path: Path) -> None:
    path = tmp_path / "companies.csv"
    path.write_text(
        "ats,name,slug,url\n"
        "ashby,G2,G2,https://jobs.ashbyhq.com/G2\n"
        "workday,Visa,Visa,https://visa.wd5.myworkdayjobs.com/Visa\n",
        encoding="utf-8",
    )
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    candidates = load_registry(path, expected_sha256=digest)
    assert [c.source_key for c in candidates] == [
        "ashby:g2", "workday:https://visa.wd5.myworkdayjobs.com/Visa"
    ]
    with pytest.raises(ValueError, match="checksum"):
        load_registry(path, expected_sha256="0" * 64)


def test_snapshot_metrics_join_only_exact_canonical_tenants(tmp_path: Path) -> None:
    candidates = [
        Candidate("greenhouse:good", "Good", "greenhouse", "good", "https://job-boards.greenhouse.io/good"),
        Candidate("greenhouse:careers", "Wrong", "greenhouse", "careers", "https://job-boards.greenhouse.io/careers"),
        Candidate("greenhouse:other", "Other", "greenhouse", "other", "https://custom.example/other"),
    ]
    path = tmp_path / "metrics.csv"
    path.write_text(
        "ats,slug,total_jobs,relevant_jobs\n"
        "greenhouse,good,20,4\n"
        "greenhouse,careers,50,20\n"
        "greenhouse,other,50,20\n",
        encoding="utf-8",
    )
    signals = signals_from_snapshot_metrics(path, candidates, observed_at="2026-09-22T12:00:00Z")
    assert list(signals) == ["greenhouse:good"]
    assert signals["greenhouse:good"]["target_roles"] == 4
    assert signals["greenhouse:good"]["adapter_success_rate"] is None


def test_plan_uses_measured_relevance_not_csv_order_and_caps_jobs() -> None:
    candidates = [
        Candidate("ashby:small", "Small", "ashby", "small", "https://jobs.ashbyhq.com/small"),
        Candidate("ashby:large", "Large", "ashby", "large", "https://jobs.ashbyhq.com/large"),
        Candidate("ashby:best", "Best", "ashby", "best", "https://jobs.ashbyhq.com/best"),
        Candidate("ashby:unknown", "Unmeasured", "ashby", "unknown", "https://jobs.ashbyhq.com/unknown"),
    ]
    signals = {
        "ashby:small": _signal(10, 5),
        "ashby:large": _signal(251, 100),
        "ashby:best": _signal(30, 10),
    }
    plan = build_plan(
        candidates, signals, registry_sha256="r", signals_sha256="s", target=100,
        max_board_jobs=250, max_estimated_jobs=100, now=NOW,
    )
    assert [item["source_key"] for item in plan["selected"]] == ["ashby:best", "ashby:small"]
    reasons = {item["source_key"]: item["reason"] for item in plan["review_queue"]}
    assert reasons["ashby:large"] == "board_too_large_for_current_database_budget"
    assert reasons["ashby:unknown"] == "no_measured_job_signals"


def test_exact_tenant_match_rejects_namesake_and_query_change() -> None:
    assert _matches_board(
        "https://jobs.ashbyhq.com/G2/jobs/123", "https://jobs.ashbyhq.com/G2"
    )
    assert not _matches_board(
        "https://jobs.ashbyhq.com/G2-other", "https://jobs.ashbyhq.com/G2"
    )
    assert not _matches_board(
        "https://workforcenow.adp.com/path?cid=bad", "https://workforcenow.adp.com/path?cid=good"
    )


def test_review_requires_curated_official_link_and_is_not_auto_approved(tmp_path: Path) -> None:
    item = {
        "source_key": "ashby:linear", "name": "Linear", "adapter": "ashby",
        "identifier": "linear", "careers_url": "https://jobs.ashbyhq.com/linear",
        "score": 40, "signals": _signal(10, 2),
    }
    plan = {
        "version": "job-utility-2026-09-23-v1", "selected": [item],
        "created_at": NOW.isoformat(), "target": 100,
    }
    evidence = tmp_path / "evidence.csv"
    evidence.write_text(
        "source_key,official_domain,official_careers_url,reviewer,reviewed_at\n",
        encoding="utf-8",
    )
    reviewed = review_plan(plan, evidence, now=NOW)
    assert reviewed["approved"] == []
    assert reviewed["identity_review_queue"][0]["reason"] == "identity_evidence_missing"
    with evidence.open("a", encoding="utf-8") as handle:
        handle.write(
            "ashby:linear,linear.app,https://linear.app/careers,operator,2026-09-23T10:00:00Z\n"
        )
    with patch(
        "applyit_ingestion.rollout.check_official_careers_link",
        return_value=(True, "https://jobs.ashbyhq.com/linear"),
    ):
        reviewed = review_plan(plan, evidence, now=NOW)
    assert [item["source_key"] for item in reviewed["approved"]] == ["ashby:linear"]
    assert reviewed["identity_review_queue"] == []


def test_staggering_is_stable_and_spans_six_hour_window() -> None:
    delays = [first_scan_delay(f"ashby:source-{index}") for index in range(1000)]
    assert delays == [first_scan_delay(f"ashby:source-{index}") for index in range(1000)]
    assert min(delays) >= 60
    assert max(delays) < 21_600
    assert len({delay // 3600 for delay in delays}) == 6


def test_rollout_routes_portfolio_and_page_title_names_to_review() -> None:
    assert is_intermediary_name("Pear VC")
    assert is_intermediary_name("mthree Recruiting Portal")
    assert is_intermediary_name("Embedding VC")
    assert not is_intermediary_name("Human Agency")
    assert is_ambiguous_employer_name("Momentum Engineering, Inc. Openings")
    assert is_ambiguous_employer_name("HackerRank Careers")


def test_one_relevant_role_is_explicit_fallback() -> None:
    candidate = Candidate(
        "ashby:futureco", "FutureCo", "ashby", "futureco",
        "https://jobs.ashbyhq.com/futureco",
    )
    default = build_plan(
        [candidate], {candidate.source_key: _signal(10, 1)},
        registry_sha256="r", signals_sha256="s", target=100, now=NOW,
    )
    assert default["selected"] == []
    fallback = build_plan(
        [candidate], {candidate.source_key: _signal(10, 1)},
        registry_sha256="r", signals_sha256="s", target=100,
        min_target_roles=1, now=NOW,
    )
    assert [row["source_key"] for row in fallback["selected"]] == [candidate.source_key]
