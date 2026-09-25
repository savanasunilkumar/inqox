from applyit_ingestion.matching import WatchMatcher


def test_exclusions_are_token_aware() -> None:
    matcher = WatchMatcher(("software engineer",), ("intern", "internship"))

    assert matcher.matches("Software Engineer, Internal Tools")
    assert matcher.matches("Internationalization Software Engineer")
    assert not matcher.matches("Software Engineer Intern")
    assert not matcher.matches("Software Engineer Internship")


def test_empty_keywords_match_every_nonexcluded_title() -> None:
    matcher = WatchMatcher((), ("intern",))

    assert matcher.matches("Product Designer")
    assert not matcher.matches("Design Intern")
