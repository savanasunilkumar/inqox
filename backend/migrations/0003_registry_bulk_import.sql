BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS registry_key text;

CREATE UNIQUE INDEX IF NOT EXISTS companies_registry_key_unique_idx
  ON companies(registry_key) WHERE registry_key IS NOT NULL;

INSERT INTO schema_migrations(version) VALUES ('0003_registry_bulk_import')
ON CONFLICT (version) DO NOTHING;

COMMIT;
