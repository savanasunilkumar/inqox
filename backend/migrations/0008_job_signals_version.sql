BEGIN;

-- NULL means the row's match signals have not been derived from its text yet.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS signals_version smallint;

CREATE INDEX IF NOT EXISTS jobs_open_signals_missing_idx
  ON jobs (id) WHERE lifecycle_state = 'open' AND signals_version IS NULL;

INSERT INTO schema_migrations(version) VALUES ('0008_job_signals_version')
ON CONFLICT (version) DO NOTHING;

COMMIT;
