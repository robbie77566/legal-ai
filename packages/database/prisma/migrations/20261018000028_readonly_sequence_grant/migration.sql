-- hg_readonly (docs/operations/sql/readonly_role.sql) could SELECT tables but
-- not sequences, and pg_dump reads every sequence's position — so the
-- production→staging baseline (scripts/staging-baseline.sh) could not dump.
-- Shipped as a migration so no database shell is needed: preDeployCommand
-- runs it as the owner on the next deploy. A no-op where the role does not
-- exist (staging, dev, CI).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'hg_readonly') THEN
    GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO hg_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO hg_readonly;
  END IF;
END $$;
