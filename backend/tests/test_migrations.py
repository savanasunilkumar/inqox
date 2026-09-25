from pathlib import Path

from pglast import parse_sql


def test_all_migrations_parse_with_postgresql_grammar() -> None:
    migrations = sorted((Path(__file__).parents[1] / "migrations").glob("*.sql"))
    assert migrations
    for migration in migrations:
        assert parse_sql(migration.read_text(encoding="utf-8"))
