BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS companies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  domain text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (domain IS NULL OR (domain = lower(domain) AND domain !~ '[/[:space:]]'))
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_domain_unique_idx
  ON companies(domain) WHERE domain IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES companies(id),
  source_key text NOT NULL UNIQUE,
  adapter text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  careers_url text,
  status text NOT NULL DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'active', 'paused', 'invalid')),
  verified_at timestamptz,
  verification_error text,
  origin text NOT NULL DEFAULT 'manual',
  origin_license text,
  origin_ref text,
  origin_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(origin_payload) = 'object'),
  scan_interval_seconds integer NOT NULL DEFAULT 21600
    CHECK (scan_interval_seconds BETWEEN 300 AND 604800),
  next_scan_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  next_scan_seq bigint NOT NULL DEFAULT 0 CHECK (next_scan_seq >= 0),
  last_applied_scan_seq bigint NOT NULL DEFAULT 0 CHECK (last_applied_scan_seq >= 0),
  baseline_completed_at timestamptz,
  last_success_at timestamptz,
  last_complete_at timestamptz,
  last_job_count integer CHECK (last_job_count IS NULL OR last_job_count >= 0),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  closure_miss_threshold smallint NOT NULL DEFAULT 2
    CHECK (closure_miss_threshold BETWEEN 2 AND 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'active' OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS job_sources_due_idx
  ON job_sources(next_scan_at, id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS job_sources_company_idx ON job_sources(company_id);
CREATE INDEX IF NOT EXISTS job_sources_lease_idx
  ON job_sources(lease_until) WHERE lease_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS scan_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES job_sources(id),
  request_key text NOT NULL,
  scan_seq bigint NOT NULL CHECK (scan_seq > 0),
  mode text NOT NULL DEFAULT 'full' CHECK (mode IN ('verify', 'full', 'incremental')),
  is_baseline boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'quarantined', 'superseded')),
  is_complete boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  expected_count integer CHECK (expected_count IS NULL OR expected_count >= 0),
  received_count integer NOT NULL DEFAULT 0 CHECK (received_count >= 0),
  unique_count integer NOT NULL DEFAULT 0 CHECK (unique_count >= 0),
  invalid_count integer NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  error_code text,
  error_message text,
  diagnostics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(diagnostics) = 'object'),
  UNIQUE(source_id, request_key),
  UNIQUE(source_id, scan_seq)
);
CREATE INDEX IF NOT EXISTS scan_runs_source_time_idx ON scan_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS scan_runs_failures_idx ON scan_runs(started_at DESC)
  WHERE status IN ('failed', 'quarantined');

CREATE TABLE IF NOT EXISTS jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id bigint NOT NULL REFERENCES job_sources(id),
  external_job_id text NOT NULL CHECK (btrim(external_job_id) <> ''),
  title text NOT NULL CHECK (btrim(title) <> ''),
  location text,
  canonical_url text NOT NULL CHECK (canonical_url ~ '^https?://'),
  apply_url text,
  published_at timestamptz,
  description_text text,
  employment_type text,
  is_remote boolean,
  lifecycle_state text NOT NULL DEFAULT 'open' CHECK (lifecycle_state IN ('open', 'closed')),
  current_version_no integer NOT NULL DEFAULT 1 CHECK (current_version_no > 0),
  current_content_hash char(64) NOT NULL CHECK (current_content_hash ~ '^[0-9a-f]{64}$'),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw) = 'object'),
  first_seen_scan_id bigint NOT NULL REFERENCES scan_runs(id),
  last_seen_scan_id bigint NOT NULL REFERENCES scan_runs(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_changed_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  missing_full_scans smallint NOT NULL DEFAULT 0 CHECK (missing_full_scans >= 0),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_id, external_job_id),
  CHECK ((lifecycle_state = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS jobs_source_state_idx ON jobs(source_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS jobs_recent_idx ON jobs(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS jobs_published_idx ON jobs(published_at DESC)
  WHERE published_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS job_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES jobs(id),
  version_no integer NOT NULL CHECK (version_no > 0),
  scan_id bigint NOT NULL REFERENCES scan_runs(id),
  change_type text NOT NULL CHECK (change_type IN ('discovered', 'updated', 'reopened', 'closed')),
  lifecycle_state text NOT NULL CHECK (lifecycle_state IN ('open', 'closed')),
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  normalized_payload jsonb NOT NULL CHECK (jsonb_typeof(normalized_payload) = 'object'),
  matches_watch boolean NOT NULL DEFAULT false,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id, version_no),
  UNIQUE(job_id, scan_id)
);
CREATE INDEX IF NOT EXISTS job_versions_job_idx ON job_versions(job_id, version_no DESC);
CREATE INDEX IF NOT EXISTS job_versions_scan_idx ON job_versions(scan_id);
CREATE INDEX IF NOT EXISTS job_versions_feed_idx ON job_versions(observed_at DESC)
  WHERE matches_watch AND change_type IN ('discovered', 'reopened');

CREATE TABLE IF NOT EXISTS notification_endpoints (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  provider text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint_id bigint NOT NULL REFERENCES notification_endpoints(id),
  job_id bigint NOT NULL REFERENCES jobs(id),
  job_version_id bigint NOT NULL REFERENCES job_versions(id),
  event_type text NOT NULL CHECK (
    event_type IN ('job.discovered', 'job.updated', 'job.reopened', 'job.closed')
  ),
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'delivered', 'dead')),
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts smallint NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 50),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  provider_message_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(endpoint_id, job_version_id, event_type),
  CHECK ((status = 'delivered') = (delivered_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS outbox_claim_idx ON notification_outbox(available_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS outbox_recover_idx ON notification_outbox(locked_until, id)
  WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS outbox_job_idx ON notification_outbox(job_id, created_at DESC);

INSERT INTO schema_migrations(version) VALUES ('0001_core')
ON CONFLICT (version) DO NOTHING;

COMMIT;
