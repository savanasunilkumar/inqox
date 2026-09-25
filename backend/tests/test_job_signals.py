from applyit_ingestion.job_signals import (
    ENTRY,
    INTERN,
    MANAGEMENT,
    MID,
    SENIOR,
    STAFF,
    JobSignals,
    acceptable_seniority,
    countries,
    country_code,
    excludes_sponsorship,
    extract_skills,
    min_years_required,
    role_families,
    seniority,
    title_pattern,
    title_phrases,
)


def test_skills_use_token_boundaries_and_canonical_names() -> None:
    text = "<p>Built React &amp; TypeScript apps on AWS with PostgreSQL, C++ and Go, services.</p>"
    assert extract_skills(text) == ["AWS", "C++", "Go", "PostgreSQL", "React", "TypeScript"]
    assert extract_skills("Good cloud javascripting, rest of the team, excel at spring") == []


def test_role_families_allow_multiple_functions() -> None:
    assert role_families("Staff Software Engineer - Data Cloud Applied ML") == ["ml", "software"]
    assert role_families("Senior SRAM Circuit Design Engineer") == ["hardware"]
    assert role_families("Implementation Specialist, Payroll IM") == ["finance", "support"]
    assert role_families("DevOps Engineer") == ["software"]
    assert role_families("Head of Sales, India") == ["sales"]


def test_seniority_from_title() -> None:
    assert seniority("Software Engineer Intern") == INTERN
    assert seniority("Software Engineer I") == ENTRY
    assert seniority("New Grad Software Engineer") == ENTRY
    assert seniority("Software Engineer II - Global Payroll") == MID
    assert seniority("Sr SW Engineer") == SENIOR
    assert seniority("Principal Verification Chip Design Engineer") == STAFF
    assert seniority("Director, Engineering – Software Engineering") == MANAGEMENT
    assert seniority("Product Manager") is None
    assert seniority("Software Engineer") is None


def test_minimum_years_and_sponsorship() -> None:
    description = "You have 5+ years of professional experience and 2 years with Go."
    assert min_years_required(description) == 5
    assert min_years_required("Founded 10 years ago.") is None
    assert excludes_sponsorship("We are unable to sponsor visas for this role.")
    assert excludes_sponsorship("Applicants must be authorized to work without sponsorship.")
    assert not excludes_sponsorship("We sponsor H-1B visas.")


def test_locations_resolve_to_countries() -> None:
    assert countries("San Francisco, CA") == ["US"]
    assert countries("US, CA, Santa Clara") == ["US"]
    assert countries("Remote (United States)") == ["US"]
    assert countries("India, Hyderabad") == ["IN"]
    assert countries("Hyderabad, IN") == ["IN"]
    assert countries("Toronto, ON, Canada") == ["CA"]
    assert countries("Brussels, Brussels, Belgium") == ["BE"]
    assert countries("2 Locations") == []
    assert country_code("United States") == "US"


def test_candidate_seniority_bands() -> None:
    assert acceptable_seniority(0.5, ["Software Development Intern"]) == [INTERN, ENTRY]
    assert acceptable_seniority(2, []) == [INTERN, ENTRY, MID]
    assert acceptable_seniority(4, []) == [ENTRY, MID, SENIOR]


def test_job_signals_derive_from_title_location_and_description() -> None:
    signals = JobSignals.derive(
        "Senior Backend Engineer",
        "Seattle, WA",
        "3+ years of experience with Python and Kubernetes. No visa sponsorship.",
    )
    assert signals.skills == ["Kubernetes", "Python"]
    assert signals.role_families == ["software"]
    assert signals.seniority == SENIOR
    assert signals.min_years == 3
    assert signals.countries == ["US"]
    assert signals.no_sponsorship


def test_hyphenated_and_abbreviated_locations() -> None:
    assert countries("US-Remote") == ["US"]
    assert countries("SA - Riyadh, Saudi Arabia") == ["SA"]
    assert countries("SF") == ["US"]


def test_title_phrases_strip_levels_and_team_suffixes() -> None:
    assert title_phrases(
        [
            "Graduate Research Assistant",
            "Software Development Intern",
            "Software Engineer (Intern to L2)",
            "Sr. Data Engineer, Payments",
            "Senior Engineer",
        ]
    ) == [
        "data developer",
        "data engineer",
        "research assistant",
        "software developer",
        "software development",
        "software engineer",
    ]
    assert title_pattern("full stack engineer") == r"\mfull[\s-]+stack[\s-]+engineer\M"
