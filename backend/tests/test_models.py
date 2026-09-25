from datetime import UTC, datetime

from applyit_ingestion.models import NormalizedJob, job_from_ats


def job(**overrides) -> NormalizedJob:
    values = {
        "external_id": "job-1",
        "title": "Software Engineer",
        "location": "Chicago, IL",
        "canonical_url": "https://example.com/jobs/1",
        "published_at": datetime(2026, 8, 1, tzinfo=UTC),
        "raw": {"request_id": "volatile-a"},
    }
    values.update(overrides)
    return NormalizedJob(**values)


def test_content_hash_ignores_volatile_raw_payload() -> None:
    assert job().content_hash() == job(raw={"request_id": "volatile-b"}).content_hash()


def test_content_hash_changes_for_user_visible_fields() -> None:
    assert job().content_hash() != job(title="Staff Software Engineer").content_hash()
    assert job().content_hash() != job(location="Remote").content_hash()


def test_external_identity_is_not_part_of_semantic_version_hash() -> None:
    assert job().content_hash() == job(external_id="job-2").content_hash()


class FakeAtsJob:
    ats_id = "upstream-1"
    url = "https://example.com/jobs/1"
    title = "Software Engineer"
    location = "Remote"
    apply_url = None
    posted_at = datetime(2026, 8, 1, tzinfo=UTC)
    description = "Large employer-authored description"
    employment_type = "full-time"
    is_remote = True

    def model_dump(self, *, mode: str):
        assert mode == "json"
        return {"raw": {"description": self.description, "request_id": "volatile"}}


def test_upstream_description_and_raw_are_not_persisted_by_default() -> None:
    normalized = job_from_ats(FakeAtsJob())
    assert normalized.description_text is None
    assert normalized.raw == {}


def test_description_storage_requires_explicit_opt_in() -> None:
    normalized = job_from_ats(FakeAtsJob(), include_description=True)
    assert normalized.description_text == FakeAtsJob.description
    assert normalized.raw["description"] == FakeAtsJob.description
