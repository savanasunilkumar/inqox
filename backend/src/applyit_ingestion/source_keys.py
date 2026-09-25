from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def make_source_key(adapter: str, identifier: str) -> str:
    """Stable source identity shared by registry import and rollout planning."""
    adapter = adapter.strip().casefold()
    identifier = identifier.strip()
    case_insensitive_slugs = {
        "ashby",
        "bamboohr",
        "breezy",
        "greenhouse",
        "lever",
        "recruitee",
        "rippling",
        "smartrecruiters",
    }
    if identifier.startswith(("http://", "https://")):
        parsed = urlsplit(identifier)
        host = (parsed.hostname or "").casefold()
        if parsed.port:
            host = f"{host}:{parsed.port}"
        normalized = urlunsplit(
            (parsed.scheme.casefold(), host, parsed.path.rstrip("/"), parsed.query, "")
        )
    else:
        normalized = identifier.casefold() if adapter in case_insensitive_slugs else identifier
    return f"{adapter}:{normalized}"
