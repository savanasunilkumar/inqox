import hashlib

import httpx
import pytest

from applyit_ingestion.adapters import registry_identifier
from applyit_ingestion.registry import import_hosted_registry
from applyit_ingestion.repository import make_source_key


def test_workday_uses_full_careers_url() -> None:
    url = "https://visa.wd5.myworkdayjobs.com/Visa"
    assert registry_identifier("workday", "visa/Visa", url) == url


def test_normal_source_uses_slug_and_source_key_is_case_insensitive() -> None:
    assert registry_identifier("ashby", "G2", "https://jobs.ashbyhq.com/G2") == "G2"
    assert make_source_key("Ashby", "G2") == "ashby:g2"


def test_url_source_key_preserves_case_sensitive_path() -> None:
    upper = make_source_key("workday", "https://visa.wd5.myworkdayjobs.com/Visa")
    lower = make_source_key("workday", "https://VISA.wd5.myworkdayjobs.com/visa")
    assert upper != lower
    assert "visa.wd5.myworkdayjobs.com/Visa" in upper


@pytest.mark.asyncio
async def test_manifest_checksum_is_verified_before_database_access() -> None:
    csv_body = b"ats,name,slug,url\nashby,Linear,linear,https://jobs.ashbyhq.com/linear\n"

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("manifest.json"):
            return httpx.Response(
                200,
                json={
                    "companies": {
                        "csv": "https://registry.example/companies.csv",
                        "sha256": "0" * 64,
                        "rows": 1,
                    }
                },
                request=request,
            )
        return httpx.Response(200, content=csv_body, request=request)

    with pytest.raises(ValueError, match="checksum mismatch"):
        await import_hosted_registry(
            None,  # type: ignore[arg-type] -- failure must happen before DB access
            "https://registry.example/manifest.json",
            transport=httpx.MockTransport(handler),
        )


@pytest.mark.asyncio
async def test_manifest_row_count_is_verified_before_database_access() -> None:
    csv_body = b"ats,name,slug,url\nashby,Linear,linear,https://jobs.ashbyhq.com/linear\n"
    digest = hashlib.sha256(csv_body).hexdigest()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("manifest.json"):
            return httpx.Response(
                200,
                json={
                    "companies": {
                        "csv": "https://registry.example/companies.csv",
                        "sha256": digest,
                        "rows": 2,
                    }
                },
                request=request,
            )
        return httpx.Response(200, content=csv_body, request=request)

    with pytest.raises(ValueError, match="row mismatch"):
        await import_hosted_registry(
            None,  # type: ignore[arg-type] -- failure must happen before DB access
            "https://registry.example/manifest.json",
            transport=httpx.MockTransport(handler),
        )
