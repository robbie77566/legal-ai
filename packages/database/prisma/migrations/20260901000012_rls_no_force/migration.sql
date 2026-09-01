-- RLS: ENABLE without FORCE (Option A, approved by founder 2026-09-01).
-- Discovery on the first production write: FORCE binds the table OWNER,
-- and unlike dev (where the owner is a superuser with an implicit
-- bypass), Render's owner is a plain role — so every system-path write
-- (seed, /buy/account fulfillment, auth bootstrap) failed with 42501.
-- Design intent has always been: the owner connection IS the system
-- surface and bypasses tenant scoping; hg_app (non-owner) remains fully
-- policy-bound — tenant isolation on the application path is unchanged
-- and continuously proven by the live-Postgres suite.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
