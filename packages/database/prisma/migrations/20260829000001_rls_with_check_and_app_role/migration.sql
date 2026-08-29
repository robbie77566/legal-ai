-- M0 RLS hardening (mvp_v1_system_design.md §10.3, implementation plan M0):
--
-- 1. The original policies were USING-only — SELECT/UPDATE/DELETE were tenant-
--    scoped but INSERTs were unconstrained, so a session could write rows into
--    another tenant. Every policy is recreated with WITH CHECK.
-- 2. CaseAccess had no RLS at all; it is tenant-reachable data and gets the
--    same treatment (scoped through its Case).
-- 3. A dedicated non-superuser application role `hg_app` is created. RLS —
--    even FORCEd — never applies to superusers, so connecting as the docker
--    image's default superuser makes every policy inert. Tenant-scoped
--    application queries must run as `hg_app` (integration tests connect as
--    it to prove the policies). PRODUCTION NOTE: rotate the password at
--    deploy time (ALTER ROLE hg_app PASSWORD ...) from the secret manager —
--    the value below is a dev/CI default, not a secret.

-- ── Application role ─────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hg_app') THEN
    CREATE ROLE hg_app LOGIN PASSWORD 'hg_app_dev_password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO hg_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hg_app;

-- ── Recreate policies with WITH CHECK ────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation_policy_user ON "User";
CREATE POLICY tenant_isolation_policy_user ON "User"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_case ON "Case";
CREATE POLICY tenant_isolation_policy_case ON "Case"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS tenant_isolation_policy_document ON "Document";
CREATE POLICY tenant_isolation_policy_document ON "Document"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

DROP POLICY IF EXISTS tenant_isolation_policy_chunk ON "DocumentChunk";
CREATE POLICY tenant_isolation_policy_chunk ON "DocumentChunk"
  USING ("documentId" IN (SELECT id FROM "Document" WHERE "caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true))))
  WITH CHECK ("documentId" IN (SELECT id FROM "Document" WHERE "caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true))));

DROP POLICY IF EXISTS tenant_isolation_policy_audit ON "AuditLog";
CREATE POLICY tenant_isolation_policy_audit ON "AuditLog"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

-- ── CaseAccess: previously unprotected ───────────────────────────────────────
ALTER TABLE "CaseAccess" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseAccess" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy_caseaccess ON "CaseAccess";
CREATE POLICY tenant_isolation_policy_caseaccess ON "CaseAccess"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));
