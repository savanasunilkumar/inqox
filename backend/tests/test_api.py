from __future__ import annotations

from dataclasses import replace

import httpx
import pytest

from applyit_ingestion import api

pytestmark = pytest.mark.asyncio


class StubRepository:
    def __init__(self) -> None:
        self.list_args: dict[str, object] | None = None
        self.match_args: dict[str, object] | None = None
        self.refresh_args: dict[str, object] | None = None

    async def list_jobs(self, limit: int, **kwargs: object) -> dict[str, object]:
        self.list_args = {"limit": limit, **kwargs}
        return {"items": [], "nextCursor": None, "hasMore": False}

    async def match_jobs(self, **kwargs: object) -> dict[str, object]:
        self.match_args = kwargs
        return {"items": [], "nextCursor": None, "hasMore": False}

    async def refresh_signals(self, **kwargs: object) -> int:
        self.refresh_args = kwargs
        return 0

    async def get_job(self, job_id: int) -> dict[str, object] | None:
        if job_id != 7:
            return None
        return {"id": 7, "title": "Engineer", "descriptionText": None}


async def test_job_routes_validate_queries_and_return_404() -> None:
    repo = StubRepository()
    api.app.dependency_overrides[api.repository] = lambda: repo
    api.app.dependency_overrides[api.require_token] = lambda: None
    try:
        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/jobs",
                params={
                    "limit": 12,
                    "before": 30,
                    "q": "engineer",
                    "company": "Example",
                    "location": "Chicago",
                    "remote": "true",
                },
            )
            assert response.status_code == 200
            assert response.json() == {"items": [], "nextCursor": None, "hasMore": False}
            assert repo.list_args == {
                "limit": 12,
                "before": 30,
                "q": "engineer",
                "company": "Example",
                "location": "Chicago",
                "remote": True,
            }
            assert (await client.get("/jobs", params={"limit": 101})).status_code == 422
            assert (await client.get("/jobs", params={"remote": "maybe"})).status_code == 422
            assert (await client.get("/jobs/0")).status_code == 422
            assert (await client.get("/jobs/8")).status_code == 404
            detail = await client.get("/jobs/7")
            assert detail.status_code == 200
            assert detail.json()["descriptionText"] is None
    finally:
        api.app.dependency_overrides.clear()


async def test_job_routes_use_existing_bearer_auth(monkeypatch: pytest.MonkeyPatch) -> None:
    repo = StubRepository()
    monkeypatch.setattr(api, "settings", replace(api.settings, api_token="test-token"))
    api.app.dependency_overrides[api.repository] = lambda: repo
    try:
        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/jobs")).status_code == 401
            assert (await client.get("/jobs/7")).status_code == 401
            response = await client.get("/jobs", headers={"Authorization": "Bearer test-token"})
            assert response.status_code == 200
    finally:
        api.app.dependency_overrides.clear()


async def test_match_route_derives_candidate_signals() -> None:
    repo = StubRepository()
    api.app.dependency_overrides[api.repository] = lambda: repo
    api.app.dependency_overrides[api.require_token] = lambda: None
    try:
        transport = httpx.ASGITransport(app=api.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/jobs/matches",
                json={
                    "text": "Built services in Python and PostgreSQL on AWS.",
                    "titles": ["Software Engineer", "Graduate Research Assistant"],
                    "yearsExperience": 3,
                    "workCountry": "United States",
                    "needsSponsorship": True,
                    "limit": 10,
                    "offset": 20,
                },
            )
            invalid = await client.post("/jobs/matches", json={"limit": 0})
    finally:
        api.app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["profile"] == {
        "skills": ["AWS", "PostgreSQL", "Python"],
        "titles": ["research assistant", "software developer", "software engineer"],
        "roles": ["software"],
        "levels": [1, 2, 3],
        "country": "US",
    }
    assert repo.match_args == {
        "skills": ["AWS", "PostgreSQL", "Python"],
        "families": ["software"],
        "levels": [1, 2, 3],
        "years": 3.0,
        "country": "US",
        "needs_sponsorship": True,
        "remote_only": False,
        "title_patterns": [
            r"\mresearch[\s-]+assistant\M",
            r"\msoftware[\s-]+developer\M",
            r"\msoftware[\s-]+engineer\M",
        ],
        "limit": 10,
        "offset": 20,
    }
    assert repo.refresh_args == {"only_missing": True}
    assert invalid.status_code == 422
