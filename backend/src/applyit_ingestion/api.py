from __future__ import annotations

import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request
from pydantic import BaseModel, Field

from .config import Settings
from .db import Database
from .job_signals import acceptable_seniority, country_code, extract_skills, role_families
from .repository import Repository

settings = Settings.from_env()


@asynccontextmanager
async def lifespan(app: FastAPI):
    database = Database(settings.database_url)
    await database.connect(min_size=1, max_size=10)
    await database.migrate()
    app.state.database = database
    app.state.repository = Repository(database.require_pool(), settings)
    yield
    await database.close()


app = FastAPI(title="ApplyIt ingestion API", version="0.1.0", lifespan=lifespan)


def require_token(authorization: str | None = Header(default=None)) -> None:
    if not settings.api_token:
        return
    expected = f"Bearer {settings.api_token}"
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="invalid API token")


def repository(request: Request) -> Repository:
    return request.app.state.repository


RepositoryDependency = Annotated[Repository, Depends(repository)]


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz(repo: RepositoryDependency) -> dict[str, object]:
    return {"status": "ready", **(await repo.health_summary())}


@app.get("/feed", dependencies=[Depends(require_token)])
async def feed(
    repo: RepositoryDependency,
    after: Annotated[int | None, Query(ge=0)] = None,
    limit: Annotated[int | None, Query(ge=1, le=1000)] = None,
) -> dict[str, object]:
    return await repo.feed(limit or settings.feed_limit, after)


@app.get("/jobs", dependencies=[Depends(require_token)])
async def list_jobs(
    repo: RepositoryDependency,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    before: Annotated[int | None, Query(ge=1)] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    company: Annotated[str | None, Query(max_length=100)] = None,
    location: Annotated[str | None, Query(max_length=100)] = None,
    remote: bool | None = None,
) -> dict[str, object]:
    return await repo.list_jobs(
        limit, before=before, q=q, company=company, location=location, remote=remote
    )


class CandidateProfile(BaseModel):
    text: str = Field(default="", max_length=200_000)
    titles: list[Annotated[str, Field(max_length=200)]] = Field(default_factory=list, max_length=50)
    skills: list[Annotated[str, Field(max_length=100)]] = Field(
        default_factory=list, max_length=200
    )
    years_experience: float | None = Field(default=None, ge=0, le=60, alias="yearsExperience")
    work_country: str | None = Field(default=None, max_length=100, alias="workCountry")
    needs_sponsorship: bool = Field(default=False, alias="needsSponsorship")
    remote_only: bool = Field(default=False, alias="remoteOnly")
    limit: int = Field(default=24, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10_000)


@app.post("/jobs/matches", dependencies=[Depends(require_token)])
async def match_jobs(repo: RepositoryDependency, profile: CandidateProfile) -> dict[str, object]:
    titles = [title for title in profile.titles if title.strip()]
    skills = sorted(
        set(extract_skills(profile.text)) | set(extract_skills(", ".join(profile.skills)))
    )
    families = sorted({family for title in titles for family in role_families(title)})
    levels = acceptable_seniority(profile.years_experience, titles)
    country = country_code(profile.work_country)
    page = await repo.match_jobs(
        skills=skills,
        families=families,
        levels=levels,
        years=profile.years_experience,
        country=country,
        needs_sponsorship=profile.needs_sponsorship,
        remote_only=profile.remote_only,
        limit=profile.limit,
        offset=profile.offset,
    )
    return {
        **page,
        "profile": {"skills": skills, "roles": families, "levels": levels, "country": country},
    }


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
async def get_job(
    repo: RepositoryDependency,
    job_id: Annotated[int, Path(ge=1)],
) -> dict[str, object]:
    job = await repo.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
