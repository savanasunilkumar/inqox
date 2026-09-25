from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import cached_property


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", value).strip()


@dataclass(frozen=True)
class WatchMatcher:
    keywords: tuple[str, ...]
    excludes: tuple[str, ...]

    @cached_property
    def normalized_keywords(self) -> tuple[str, ...]:
        return tuple(filter(None, (_normalize(value) for value in self.keywords)))

    @cached_property
    def exclude_patterns(self) -> tuple[re.Pattern[str], ...]:
        return tuple(
            re.compile(r"(?<![\w])" + re.escape(_normalize(value)) + r"(?![\w])")
            for value in self.excludes
            if _normalize(value)
        )

    def matches(self, title: str) -> bool:
        normalized = _normalize(title)
        if any(pattern.search(normalized) for pattern in self.exclude_patterns):
            return False
        return not self.normalized_keywords or any(
            keyword in normalized for keyword in self.normalized_keywords
        )
