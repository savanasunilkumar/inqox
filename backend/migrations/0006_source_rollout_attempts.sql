BEGIN;

CREATE TABLE IF NOT EXISTS source_rollout_attempts (
  source_id bigint PRIMARY KEY REFERENCES job_sources(id),
  outcome text NOT NULL CHECK (outcome IN ('review', 'retry', 'activated')),
  reason text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz
);

INSERT INTO schema_migrations(version) VALUES ('0006_source_rollout_attempts')
ON CONFLICT (version) DO NOTHING;

COMMIT;
