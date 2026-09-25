from __future__ import annotations

import argparse
import asyncio
import csv
import json
import logging
from dataclasses import asdict
from pathlib import Path

from .adapters import AdapterScanError, scan_source
from .cleanup import prune_sandbox_candidate
from .config import Settings
from .db import Database
from .models import Source
from .outbox import OutboxWorker
from .registry import import_hosted_registry
from .repository import Repository, make_rate_limit_key, make_source_key
from .rollout_activation import activate_reviewed_plan, validate_reviewed_plan
from .scanner import scan_batch, scan_once, scan_with_lease, scanner_worker


def _rollout_plan_path(args: argparse.Namespace) -> Path:
    if args.plan is not None:
        return args.plan
    filename = "rollout-reviewed-stage100.json" if args.stage == 100 else "rollout-reviewed-stage1000.json"
    packaged = Path(__file__).resolve().parent / "config" / filename
    development = Path(__file__).resolve().parents[2] / "config" / filename
    return packaged if packaged.is_file() else development


def _parser() -> argparse.ArgumentParser:
    packaged_config = Path(__file__).resolve().parent / "config" / "bootstrap_sources.csv"
    development_config = Path(__file__).resolve().parents[2] / "config" / "bootstrap_sources.csv"
    parser = argparse.ArgumentParser(prog="applyit-ingestion")
    parser.add_argument("--log-level", default="INFO")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("migrate", help="apply PostgreSQL migrations")

    bootstrap = sub.add_parser("bootstrap", help="upsert the reviewed starter sources")
    bootstrap.add_argument(
        "--file",
        type=Path,
        default=packaged_config if packaged_config.is_file() else development_config,
    )

    smoke = sub.add_parser(
        "smoke-sources", help="read-only live check of the reviewed starter source file"
    )
    smoke.add_argument(
        "--file",
        type=Path,
        default=packaged_config if packaged_config.is_file() else development_config,
    )
    bootstrap.add_argument(
        "--activate",
        action="store_true",
        help="activate the manually reviewed starter list (first scan remains silent)",
    )

    scan = sub.add_parser("scan-once", help="scan one due active source")
    scan.add_argument("--source-id", type=int)
    batch = sub.add_parser("scan-batch", help="scan due sources concurrently, then exit")
    batch.add_argument("--max-sources", type=int, default=10_000)
    batch.add_argument("--max-seconds", type=int, default=3_300)
    batch.add_argument("--concurrency", type=int, default=20)
    sub.add_parser("scanner", help="run the due-source scanner loop")

    verify = sub.add_parser("verify-source", help="full-scan a candidate before activation")
    verify.add_argument("source_id", type=int)
    verify.add_argument("--activate", action="store_true")

    sub.add_parser("notify-once", help="deliver one pending outbox row")
    sub.add_parser("notifier", help="run the notification delivery loop")

    registry = sub.add_parser("registry-import", help="import hosted companies as candidates")
    registry.add_argument("--url")
    registry.add_argument("--limit", type=int)

    rollout_import = sub.add_parser(
        "rollout-import", help="import only identity-reviewed plan sources as candidates"
    )
    rollout_import.add_argument("--plan", type=Path)
    rollout_import.add_argument("--stage", type=int, choices=(100, 500, 1000), default=100)
    rollout_import.add_argument("--url", help="hosted registry manifest URL")
    rollout_import.add_argument("--execute", action="store_true", help="write reviewed candidates")

    rollout = sub.add_parser(
        "rollout-activate", help="dry-run or activate reviewed ranked sources in stages"
    )
    rollout.add_argument("--plan", type=Path)
    rollout.add_argument("--stage", type=int, choices=(100, 500, 1000), required=True)
    rollout.add_argument("--max-attempts", type=int, default=10)
    rollout.add_argument("--max-seconds", type=int, default=3300)
    rollout.add_argument("--execute", action="store_true", help="perform bounded activation")

    sources = sub.add_parser("sources", help="show source status")
    sources.add_argument("--limit", type=int, default=100)
    sub.add_parser("status", help="show operational counts")

    prune = sub.add_parser(
        "prune-sandbox-candidate",
        help="inspect or remove only the unused greenhouse:examplecorpsandbox registry candidate",
    )
    prune.add_argument("--execute", action="store_true", help="delete the guarded candidate and orphan company")

    serve = sub.add_parser("serve", help="run the feed API")
    serve.add_argument("--reload", action="store_true")
    return parser


async def _smoke_sources(path: Path, settings: Settings) -> list[dict[str, object]]:
    rows = list(csv.DictReader(path.read_text(encoding="utf-8").splitlines()))
    output: list[dict[str, object]] = []
    for index, row in enumerate(rows, start=1):
        adapter = row["adapter"].strip().casefold()
        identifier = row["identifier"].strip()
        careers_url = row.get("careers_url") or None
        source = Source(
            id=index,
            company_id=index,
            company_name=row["name"].strip(),
            domain=row.get("domain") or None,
            source_key=make_source_key(adapter, identifier),
            rate_limit_key=make_rate_limit_key(adapter, identifier, careers_url),
            adapter=adapter,
            identifier=identifier,
            careers_url=careers_url,
            config={"include_descriptions": False},
            status="candidate",
            scan_interval_seconds=int(row.get("scan_interval_seconds") or 21600),
            baseline_completed_at=None,
            last_job_count=None,
            closure_miss_threshold=2,
        )
        try:
            result = await scan_source(source, settings)
            output.append(
                {
                    "company": source.company_name,
                    "source": source.source_key,
                    "complete": result.complete,
                    "jobs": result.unique_count,
                    "invalid": result.invalid_count,
                }
            )
        except AdapterScanError as exc:
            output.append(
                {
                    "company": source.company_name,
                    "source": source.source_key,
                    "complete": False,
                    "error": str(exc),
                }
            )
    return output


async def _database_command(args: argparse.Namespace, settings: Settings) -> None:
    database = Database(settings.database_url)
    pool_size = min(max(getattr(args, "concurrency", 1) + 4, 10), 64)
    await database.connect(max_size=pool_size)
    try:
        if args.command != "prune-sandbox-candidate" and (
            args.command not in {"rollout-activate", "rollout-import"} or args.execute
        ):
            await database.migrate()
        repository = Repository(database.require_pool(), settings)
        if args.command == "migrate":
            output = {"status": "ok", "migrations": "current"}
        elif args.command == "bootstrap":
            count = await repository.bootstrap_sources(args.file, activate=args.activate)
            output = {"status": "ok", "sources": count, "active": args.activate}
        elif args.command == "scan-once":
            output = await scan_once(repository, settings, args.source_id)
            if output is None:
                output = {"status": "idle", "message": "no claimable source"}
        elif args.command == "scan-batch":
            if args.max_sources < 1 or args.max_seconds < 1 or args.concurrency < 1:
                raise RuntimeError("batch limits and concurrency must be positive")
            output = await scan_batch(
                repository,
                settings,
                max_sources=args.max_sources,
                max_seconds=args.max_seconds,
                concurrency=min(args.concurrency, 50),
            )
        elif args.command == "scanner":
            await scanner_worker(repository, settings)
            return
        elif args.command == "verify-source":
            claim = await repository.claim_verification(args.source_id)
            if claim is None:
                raise RuntimeError("candidate source is missing, active, or already leased")
            try:
                result = await scan_with_lease(repository, settings, claim)
                if result.unique_count == 0:
                    summary = await repository.quarantine_scan(
                        claim,
                        result,
                        "candidate returned zero jobs; identity cannot be verified",
                    )
                else:
                    summary = await repository.apply_scan(claim, result)
            except Exception as exc:
                await repository.fail_scan(claim, exc)
                raise
            if summary.status == "succeeded" and args.activate:
                await repository.activate_verified(args.source_id)
            output = {
                "source": claim.source.source_key,
                **summary.to_dict(),
                "activated": summary.status == "succeeded" and args.activate,
            }
        elif args.command == "notify-once":
            output = await OutboxWorker(database.require_pool(), settings).run_once()
            if output is None:
                output = {"status": "idle", "message": "no pending notification"}
        elif args.command == "notifier":
            await OutboxWorker(database.require_pool(), settings).run_forever()
            return
        elif args.command == "registry-import":
            summary = await import_hosted_registry(
                database.require_pool(),
                args.url or settings.registry_manifest_url,
                limit=args.limit,
            )
            output = asdict(summary)
        elif args.command == "rollout-import":
            plan = json.loads(_rollout_plan_path(args).read_text(encoding="utf-8"))
            validate_reviewed_plan(plan, int(plan.get("target", 0)))
            keys = {str(item["source_key"]) for item in plan["approved"]}
            if args.execute:
                summary = await import_hosted_registry(
                    database.require_pool(),
                    args.url or settings.registry_manifest_url,
                    allowed_source_keys=keys,
                    expected_registry_sha256=plan["registry_sha256"],
                )
                output = {"mode": "execute", "approved_keys": len(keys), **asdict(summary)}
            else:
                output = {"mode": "dry_run", "approved_keys": len(keys)}
        elif args.command == "rollout-activate":
            plan = json.loads(_rollout_plan_path(args).read_text(encoding="utf-8"))
            output = await activate_reviewed_plan(
                repository,
                settings,
                plan,
                target=args.stage,
                execute=args.execute,
                max_attempts=args.max_attempts,
                max_seconds=args.max_seconds,
            )
        elif args.command == "prune-sandbox-candidate":
            output = await prune_sandbox_candidate(database.require_pool(), execute=args.execute)
        elif args.command == "sources":
            output = await repository.source_rows(args.limit)
        elif args.command == "status":
            output = await repository.health_summary()
        else:
            raise RuntimeError(f"unsupported command: {args.command}")
        print(json.dumps(output, indent=2, default=str, sort_keys=True))
    finally:
        await database.close()


def main() -> None:
    args = _parser().parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    settings = Settings.from_env()
    if args.command == "smoke-sources":
        print(
            json.dumps(asyncio.run(_smoke_sources(args.file, settings)), indent=2, sort_keys=True)
        )
        return
    if args.command == "serve":
        import uvicorn

        uvicorn.run(
            "applyit_ingestion.api:app",
            host=settings.api_host,
            port=settings.api_port,
            reload=args.reload,
        )
        return
    asyncio.run(_database_command(args, settings))


if __name__ == "__main__":
    main()
