-- Audit rows are append-only and deliberately survive case deletion
-- (retention matrix, docs/architecture/mvp_v1_system_design.md §11a.2).
-- The FK would otherwise block Case deletes once audit rows exist.
ALTER TABLE "AuditLog" DROP CONSTRAINT IF EXISTS "AuditLog_caseId_fkey";
CREATE INDEX IF NOT EXISTS "AuditLog_caseId_idx" ON "AuditLog"("caseId");
