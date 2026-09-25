BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS role_families text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seniority smallint CHECK (seniority BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS min_years smallint CHECK (min_years BETWEEN 0 AND 30),
  ADD COLUMN IF NOT EXISTS countries text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS no_sponsorship boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS jobs_open_skills_idx
  ON jobs USING gin (skills) WHERE lifecycle_state = 'open';
CREATE INDEX IF NOT EXISTS jobs_open_role_families_idx
  ON jobs USING gin (role_families) WHERE lifecycle_state = 'open';

-- Candidate matching needs posting bodies, so every source now stores them.
UPDATE job_sources
SET config = jsonb_set(config, '{include_descriptions}', 'true'::jsonb), updated_at = now()
WHERE coalesce((config ->> 'include_descriptions')::boolean, false) = false;

INSERT INTO schema_migrations(version) VALUES ('0007_job_match_signals')
ON CONFLICT (version) DO NOTHING;

COMMIT;
