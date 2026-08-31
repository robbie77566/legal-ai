-- NFR-4 cost telemetry ledger (no FK; tenant-denormalized like Payment).
CREATE TABLE "CostRecord" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "detail" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "cacheReadTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "pages" INTEGER,
    "amountUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostRecord_caseId_idx" ON "CostRecord"("caseId");

ALTER TABLE "CostRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CostRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_costrecord ON "CostRecord"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
