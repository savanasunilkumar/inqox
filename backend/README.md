# ApplyIt ingestion v2

This is the scalable replacement for the original KV-based `job-watcher`.
It uses the open-source
[`ats-scrapers`](https://github.com/kalil0321/ats-scrapers) connector library,
but keeps source validation, scheduling, job history, matching, and delivery in
ApplyIt's own PostgreSQL database.

The old Cloudflare Worker is deliberately untouched. Run v2 in shadow mode,
compare it with the old feed, then point the desktop application's **Jobs API
URL** setting at v2. No production deployment is performed by this repository.

## What is implemented

- A SHA-pinned `ats-scrapers` build with the newer Workday fixes.
- Corrected starter sources for Stripe, Spotify, Linear, Visa, NVIDIA, bunq,
  G2, and Rippling.
- PostgreSQL identities scoped as `(source_id, external_job_id)`.
- Silent first baseline, including a genuinely empty baseline.
- Full-snapshot reconciliation with job versions. Only connectors with a
  reviewed per-source completeness contract may close a role, and closure
  requires two healthy misses. Bulk registry sources and connectors without a
  hard completeness proof remain discoveries-only.
- Quarantine for incomplete or severe count-collapse snapshots.
- Transactional notification outbox: job discovery and pending delivery commit
  together; HTTP failure never marks a notification delivered.
- Retry leases, bounded attempts, `Retry-After`, exponential backoff, and jitter.
- Heartbeated source leases and bounded-concurrency provider/tenant rate-limit
  leases, so slow scans cannot overwrite replacements or serialize an ATS
  globally.
- Cursor-paginated `/feed` events. Electron persists the cursor, drains backlog
  across pages, and merges unique version IDs instead of replacing a latest-200
  snapshot.
- Cursor-paginated `/jobs` and `/jobs/{id}` for a current-open-jobs board.
- Hosted registry import. All imported rows remain `candidate` until a complete
  verification scan succeeds.
- Descriptions and raw provider payloads stripped by default to control storage
  and avoid republishing employer-authored content unnecessarily.

## Architecture

```mermaid
flowchart LR
  Registry["Open candidate registry\n79,906 sources"] --> Verify["Identity + full-scan verification"]
  Verify --> Sources["PostgreSQL source catalog"]
  Sources --> Claim["Leased, rate-limited scanner"]
  Claim --> ATS["Official ATS API/feed"]
  ATS --> Reconcile["Transactional reconcile"]
  Reconcile --> Jobs["Jobs + versions"]
  Reconcile --> Outbox["Notification outbox"]
  Outbox --> Ntfy["Authenticated ntfy"]
  Jobs --> Feed["Cursor /feed"]
  Feed --> Desktop["Agent Browser"]
```

PostgreSQL is also the queue in this first deployment: workers claim due sources
and outbox rows with `FOR UPDATE SKIP LOCKED`. This is enough to scale by adding
scanner replicas without allowing two workers to scan the same source. Shared
providers use explicit concurrency and spacing budgets rather than one global
mutex. A managed queue can replace the claim loop later without changing job
identity or reconciliation.

## Run locally

Requirements: Docker with Compose.

1. Copy `.env.example` to `.env` and set a long `API_TOKEN` if anything other
   than localhost will reach the API.
2. Set `NTFY_TOPIC` only if notification delivery is wanted. `ntfy.sh` topics
   are public; use an authenticated private/self-hosted server for production.
3. Start the stack:

   ```bash
   docker compose up --build
   ```

The stack migrates the database, upserts the reviewed eight sources, and starts
the API, scanner, and notifier. The first complete scan seeds each source
silently. Later matching discoveries appear at `http://127.0.0.1:8080/feed`.
The feed accepts `after=<version-id>&limit=<1..1000>` and returns
`{items,nextCursor,hasMore}`; clients should checkpoint only after consuming a
page.

For a job board, `GET /jobs` returns currently open roles from active sources,
newest discovery first. It accepts `limit=1..100` (default 24),
`before=<job-id>` for the next page, and optional case-insensitive substring
filters `q`, `company`, and `location`. The `remote=true|false` filter matches only jobs whose remote status
is explicitly known. The response is `{items,nextCursor,hasMore}`; pass a
non-null `nextCursor` as `before` while `hasMore` is true. Each item contains
`id`, `title`, `company`, `domain`, `location`, `url`, `applyUrl`, `publishedAt`,
`firstSeenAt`, `employmentType`, `isRemote`, and `sourceKey`. `GET /jobs/{id}`
adds `descriptionText` and returns 404 if the job is closed or absent.
Descriptions are usually null because the scanner strips them by default.
Both routes use the same `API_TOKEN` bearer authentication as `/feed` when set.

One scanner process handles one source at a time. Scale workers, not concurrency
inside a single source scan; PostgreSQL leases enforce the shared budgets:

```bash
docker compose up --build --scale scanner=8
```

Choose the production replica count from measured p95 scan duration and due-scan
lag. Do not jump directly from eight sources to the entire registry.

Useful commands:

```bash
docker compose run --rm migrate status
docker compose run --rm migrate sources --limit 20
docker compose run --rm migrate scan-once --source-id 1
docker compose run --rm migrate notify-once
docker compose run --rm migrate smoke-sources
```

To connect the desktop, open its settings and set **Jobs API URL** to
`http://127.0.0.1:8080/feed`. For an authenticated API, do not use the editable
setting: launch the desktop with both `JOBS_API_URL` and `JOBS_API_TOKEN` in its
environment. The immutable pair stays in Electron's main process and the token
is never attached to a renderer-configurable origin.

## Expand beyond eight companies

The hosted registry is a discovery input, not a trusted production database.
It includes stale tenants and namesakes—the exact problem that previously
mapped Visa and G2 to the wrong boards.

The importer reads the published manifest first and rejects the CSV if its
SHA-256 or complete row count does not match.

Import all rows as candidates:

```bash
docker compose run --rm migrate registry-import
```

### Reviewed six-hour rollout (100 → 500 → 1,000)

The hosted company CSV is alphabetic and does not contain job counts. Do not
use `registry-import --limit` for this rollout. First generate measured per-source
signals from a checksum-verified JobHive snapshot. The planning command accepts
either a signals CSV or snapshot metrics (`ats,slug,total_jobs,relevant_jobs`):

```bash
python -m applyit_ingestion.rollout plan \
  --registry companies.csv --registry-sha256 MANIFEST_COMPANIES_SHA256 \
  --snapshot-metrics source-job-metrics.csv --snapshot-at MANIFEST_UPDATED_AT \
  --target 1000 --candidate-pool 3000 --output rollout-plan.json
python -m applyit_ingestion.rollout review --mode ats-metadata \
  --plan rollout-plan.json --output config/rollout-reviewed-stage100.json
```

The review checks a fresh ATS-owned board name against the exact employer name,
canonical tenant path, and HTTPS response. It queues missing, generic, duplicate,
or mismatched names. `--mode official-links --evidence reviewed-domains.csv` is
available when an employer-owned careers page links directly to the ATS board.
The default shortlist requires at least five relevant open roles per source. If
that leaves fewer than 1,000 verified employers, an explicit
`--min-target-roles 1` rerun can add smaller boards; zero-relevance boards still
stay out of this rollout.
The reviewed plan contains public source evidence and scores, not credentials.
Keep the reviewed JSON under `config/` **before building the Docker image**; the
wheel packages it as `applyit_ingestion/config/rollout-reviewed-stage100.json`.
For later stages, package the independently reviewed reserve as
`config/rollout-reviewed-stage1000.json`. `--stage 500` and `--stage 1000`
automatically use that packaged file; `rollout-import --stage 1000` imports its
approved reserve as inactive candidates.

The image entrypoint can then run these bounded commands with the packaged plan:

```bash
applyit-ingestion rollout-import
applyit-ingestion rollout-import --execute
applyit-ingestion rollout-activate --stage 100
applyit-ingestion rollout-activate --stage 100 --execute --max-attempts 10 --max-seconds 3300
```

The first form of each command is read-only. `rollout-import` checks the live
registry checksum against the reviewed plan and imports only approved source
keys as candidates. Activation rechecks live identity, performs a silent complete
baseline, rejects empty or oversized boards, and staggers each source's next
scan across six hours. It caps each source at 250 jobs, keeps allocated catalog
capacity below 100,000 jobs, and records terminal review or retry outcomes so
later runs skip failed candidates. Stage 500 requires 100 active sources observed
for 48 hours; stage 1,000 requires 500 observed for 72 hours. Both require recent
scanner health. Run the same commands with `--stage 500` or `--stage 1000` only
after those gates pass. Database integration tests require a disposable
`TEST_DATABASE_URL`; never point them at production.

For a smaller rehearsal:

```bash
docker compose run --rm migrate registry-import --limit 500
```

Then inspect candidates and verify them individually:

```bash
docker compose run --rm migrate sources --limit 100
docker compose run --rm migrate verify-source 123 --activate
```

`verify-source` performs a complete, silent baseline. Activation fails if the
adapter errors, returns malformed rows, or trips the count guard. For bulk
activation, add a review pipeline that also confirms the employer's official
careers link redirects to the candidate ATS and that the returned company
identity is correct. Do not automatically activate a name search result.

Activation means “safe to ingest discoveries,” not automatically “safe to infer
closures.” Every bulk-imported source starts discoveries-only. Closure must be
enabled per source after proving that all pagination is exhausted and schema
failures are distinguishable from a legitimate empty board. Workday stays
discoveries-only because very large tenants can exhaust its facet subdivision
while still returning a superficially successful result.

Use different freshness tiers instead of polling every company every ten
minutes:

- explicitly watched companies: 10 minutes;
- verified normal catalog: 6 hours;
- low-value or repeatedly failing sources: daily with exponential backoff;
- paused/invalid candidates: no scheduled polling.

Recommended rollout gates:

1. Run the corrected eight in shadow mode for at least 48 hours.
2. Require complete scans and compare source IDs/counts against the official
   boards; inspect every quarantine.
3. Expand to 500 verified sources, then 5,000, 25,000, and finally the useful
   portion of the registry.
4. At every gate, monitor overdue sources, count collapses, scan failures,
   open-job totals, oldest pending delivery, retries, and dead deliveries.
5. Keep the legacy feed fallback until v2 has passed alert-failure and duplicate
   delivery drills.

Polling all ~80,000 candidates every ten minutes would be wasteful and likely
hostile to ATS providers. The tiered scheduler and shared-host leases are part
of the design, not optional cleanup.

## Tests

Pure tests run in the application image. PostgreSQL integration tests require a
dedicated test database and intentionally refuse to run without
`TEST_DATABASE_URL`:

```bash
pytest
TEST_DATABASE_URL=postgresql://applyit:applyit@localhost:55432/applyit pytest
```

The integration suite covers silent/empty baselines, atomic discovery/outbox
creation, token-aware exclusions, two-complete-scan closure, discoveries-only
sources, incomplete-scan quarantine, lease-loss races, bounded concurrent
claims, idempotent registry import, notification poison responses, and cursor
feed pagination.

## Production boundary

Python connectors cannot run inside the existing JavaScript Cloudflare Worker.
Production needs a Python 3.13 container service plus managed PostgreSQL. The
Worker can remain a thin authenticated API/scheduler proxy if desired. Before
cutover, also add backups, TLS, secret management, metrics/traces, a dead-letter
operator workflow, and retention jobs for old scans/deliveries.

The outbox provides no-loss, at-least-once delivery. A crash after ntfy accepts
a message but before PostgreSQL records the response can still create a
duplicate because ntfy does not provide server-side idempotency. That limitation
is documented rather than hidden.
