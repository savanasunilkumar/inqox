BEGIN;

CREATE TABLE IF NOT EXISTS source_rollout_reviews (
  source_id bigint PRIMARY KEY REFERENCES job_sources(id),
  ranking_version text NOT NULL,
  score numeric(12,3) NOT NULL CHECK (score >= 0),
  score_inputs jsonb NOT NULL CHECK (jsonb_typeof(score_inputs) = 'object'),
  registry_sha256 char(64) NOT NULL,
  signals_sha256 char(64) NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN ('official_careers_link', 'ats_live_metadata')),
  official_domain text,
  official_careers_url text,
  linked_ats_url text,
  metadata_url text,
  observed_name text,
  response_sha256 char(64),
  reviewer text NOT NULL,
  reviewed_at timestamptz NOT NULL,
  identity_checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations(version) VALUES ('0005_source_rollout_reviews')
ON CONFLICT (version) DO NOTHING;

COMMIT;
