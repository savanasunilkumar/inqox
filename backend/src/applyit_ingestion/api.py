from __future__ import annotations

import secrets
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Path, Query, Request

from .config import Settings
from .db import Database
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


@app.get("/jobs/{job_id}", dependencies=[Depends(require_token)])
async def get_job(
    repo: RepositoryDependency,
    job_id: Annotated[int, Path(ge=1)],
) -> dict[str, object]:
    job = await repo.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job
