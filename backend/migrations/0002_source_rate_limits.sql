BEGIN;

CREATE TABLE IF NOT EXISTS source_rate_limits (
  rate_limit_key text PRIMARY KEY,
  min_spacing_ms integer NOT NULL DEFAULT 250 CHECK (min_spacing_ms BETWEEN 0 AND 60000),
  next_allowed_at timestamptz NOT NULL DEFAULT now(),
  lease_token text,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_sources ADD COLUMN IF NOT EXISTS rate_limit_key text;

INSERT INTO source_rate_limits(rate_limit_key)
SELECT DISTINCT adapter FROM job_sources
ON CONFLICT (rate_limit_key) DO NOTHING;

UPDATE job_sources SET rate_limit_key = adapter WHERE rate_limit_key IS NULL;

ALTER TABLE job_sources ALTER COLUMN rate_limit_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_sources_rate_limit_key_fkey'
  ) THEN
    ALTER TABLE job_sources
      ADD CONSTRAINT job_sources_rate_limit_key_fkey
      FOREIGN KEY (rate_limit_key) REFERENCES source_rate_limits(rate_limit_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS source_rate_limits_due_idx
  ON source_rate_limits(next_allowed_at)
  WHERE lease_until IS NULL;

INSERT INTO schema_migrations(version) VALUES ('0002_source_rate_limits')
ON CONFLICT (version) DO NOTHING;

COMMIT;
