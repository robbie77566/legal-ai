-- Read-only inspection role for the production database (2026-09-11).
-- Run ONCE as the owner in Render → hg-postgres → Shell (psql). Replace the
-- password (openssl rand -base64 24 | tr -dc 'A-Za-z0-9'); it goes into the
-- dev box's .env.prod as PROD_DATABASE_URL. This role can SELECT and nothing
-- else — no writes, no DDL — so a debugging session cannot damage anything.
CREATE ROLE hg_readonly LOGIN PASSWORD '<PASSWORD>';
GRANT CONNECT ON DATABASE familycasereview_7ik1 TO hg_readonly;
GRANT USAGE ON SCHEMA public TO hg_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hg_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hg_readonly;
-- Tenant rows are RLS-protected for hg_app; hg_readonly is a system role that
-- reads across tenants (same posture as the ops console's owner connection).
-- Verify:  \du hg_readonly   then from the dev box:  pnpm prod:case <email>
