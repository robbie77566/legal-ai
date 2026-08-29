-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "DisclosureAck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT,
    "disclosureSetVersion" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT,
    "ackAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisclosureAck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DisclosureAck_userId_ackAt_idx" ON "DisclosureAck"("userId", "ackAt");

-- CreateIndex
CREATE INDEX "DisclosureAck_caseId_idx" ON "DisclosureAck"("caseId");


-- Tenant-scoped RLS; the archive is read by its owner (and by Ops via the
-- owner connection for the E-6 export, M6).
ALTER TABLE "DisclosureAck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisclosureAck" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_disclosure_ack ON "DisclosureAck"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
