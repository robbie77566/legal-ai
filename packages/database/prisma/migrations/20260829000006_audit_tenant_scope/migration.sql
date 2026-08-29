-- AuditLog RLS scoped through Case broke the moment a Case was hard-deleted
-- (OPS-4): the WITH CHECK subquery came up empty and post-deletion audit
-- writes were rejected. Denormalize tenantId (like CaseEvent) so the audit
-- skeleton is scoped in its own right and survives deletion (§11a.2).
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- Backfill requires a one-time exception to the append-only trigger.
ALTER TABLE "AuditLog" DISABLE TRIGGER trg_auditlog_append_only;
UPDATE "AuditLog" a SET "tenantId" = c."tenantId" FROM "Case" c WHERE c.id = a."caseId";
ALTER TABLE "AuditLog" ENABLE TRIGGER trg_auditlog_append_only;

DROP POLICY IF EXISTS tenant_isolation_policy_audit ON "AuditLog";
CREATE POLICY tenant_isolation_policy_audit ON "AuditLog"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
