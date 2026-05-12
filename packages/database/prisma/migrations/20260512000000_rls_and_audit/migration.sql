-- Enable Row Level Security
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Case" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;

-- Create policies based on current_setting('app.current_tenant_id')
CREATE POLICY tenant_isolation_policy_user ON "User"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_policy_case ON "Case"
  USING ("tenantId" = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_policy_document ON "Document"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

CREATE POLICY tenant_isolation_policy_chunk ON "DocumentChunk"
  USING ("documentId" IN (SELECT id FROM "Document" WHERE "caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true))));

CREATE POLICY tenant_isolation_policy_audit ON "AuditLog"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

-- Create trigger function to prevent UPDATE and DELETE on AuditLog
CREATE OR REPLACE FUNCTION enforce_append_only_audit()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog is append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to AuditLog
CREATE TRIGGER trg_auditlog_append_only
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only_audit();
