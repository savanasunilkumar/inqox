BEGIN;

ALTER TABLE source_rate_limits
  ADD COLUMN IF NOT EXISTS max_concurrency smallint NOT NULL DEFAULT 2
  CHECK (max_concurrency BETWEEN 1 AND 100);

CREATE TABLE IF NOT EXISTS source_rate_limit_leases (
  lease_token text PRIMARY KEY,
  rate_limit_key text NOT NULL REFERENCES source_rate_limits(rate_limit_key) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS source_rate_limit_leases_key_idx
  ON source_rate_limit_leases(rate_limit_key, expires_at);
CREATE INDEX IF NOT EXISTS source_rate_limit_leases_expiry_idx
  ON source_rate_limit_leases(expires_at);

-- Preserve any in-flight v1 lease during a rolling upgrade. The new worker
-- ignores the legacy columns after this migration, but the lease remains
-- represented until its original expiry.
INSERT INTO source_rate_limit_leases(lease_token, rate_limit_key, expires_at)
SELECT lease_token, rate_limit_key, lease_until
FROM source_rate_limits
WHERE lease_token IS NOT NULL AND lease_until > now()
ON CONFLICT (lease_token) DO NOTHING;

UPDATE source_rate_limits SET lease_token = NULL, lease_until = NULL
WHERE lease_token IS NOT NULL OR lease_until IS NOT NULL;

DROP INDEX IF EXISTS source_rate_limits_due_idx;
CREATE INDEX source_rate_limits_due_idx ON source_rate_limits(next_allowed_at);

INSERT INTO schema_migrations(version) VALUES ('0004_concurrent_rate_limits')
ON CONFLICT (version) DO NOTHING;

COMMIT;
