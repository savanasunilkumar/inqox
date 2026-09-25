from __future__ import annotations

import json
from pathlib import Path

import asyncpg


async def _init_connection(connection: asyncpg.Connection) -> None:
    for type_name in ("json", "jsonb"):
        await connection.set_type_codec(
            type_name,
            schema="pg_catalog",
            encoder=json.dumps,
            decoder=json.loads,
            format="text",
        )


class Database:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn
        self.pool: asyncpg.Pool | None = None

    async def connect(self, *, min_size: int = 1, max_size: int = 10) -> None:
        if self.pool is None:
            self.pool = await asyncpg.create_pool(
                self.dsn,
                min_size=min_size,
                max_size=max_size,
                command_timeout=60,
                init=_init_connection,
            )

    async def close(self) -> None:
        if self.pool is not None:
            await self.pool.close()
            self.pool = None

    def require_pool(self) -> asyncpg.Pool:
        if self.pool is None:
            raise RuntimeError("database is not connected")
        return self.pool

    async def migrate(self) -> None:
        pool = self.require_pool()
        packaged = Path(__file__).resolve().parent / "migrations"
        development = Path(__file__).resolve().parents[2] / "migrations"
        migrations_dir = packaged if packaged.is_dir() else development
        async with pool.acquire() as connection:
            await connection.execute(
                "SELECT pg_advisory_lock(hashtext('applyit_ingestion_migrations'))"
            )
            try:
                for path in sorted(migrations_dir.glob("*.sql")):
                    already = await connection.fetchval(
                        "SELECT to_regclass('public.schema_migrations') IS NOT NULL"
                    )
                    if already:
                        applied = await connection.fetchval(
                            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)",
                            path.stem,
                        )
                        if applied:
                            continue
                    await connection.execute(path.read_text(encoding="utf-8"))
            finally:
                await connection.execute(
                    "SELECT pg_advisory_unlock(hashtext('applyit_ingestion_migrations'))"
                )
