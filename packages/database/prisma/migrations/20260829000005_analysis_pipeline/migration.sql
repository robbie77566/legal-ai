-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runNo" INTEGER NOT NULL DEFAULT 1,
    "modelConfig" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "adjudication" TEXT NOT NULL DEFAULT 'not_run',
    "s4Tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partAText" TEXT NOT NULL,
    "partBText" TEXT NOT NULL,
    "provenance" TEXT NOT NULL DEFAULT 'ai',

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingCitation" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "volume" TEXT,
    "page" INTEGER,
    "line" INTEGER,
    "chunkId" TEXT NOT NULL,
    "excerptHash" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,

    CONSTRAINT "FindingCitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL DEFAULT 1,
    "templateVersion" TEXT NOT NULL,
    "findingsSnapshot" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "renderedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_caseId_idx" ON "AnalysisRun"("caseId");

-- CreateIndex
CREATE INDEX "Finding_caseId_runId_idx" ON "Finding"("caseId", "runId");

-- CreateIndex
CREATE INDEX "FindingCitation_findingId_idx" ON "FindingCitation"("findingId");

-- CreateIndex
CREATE INDEX "Report_caseId_idx" ON "Report"("caseId");

-- AddForeignKey
ALTER TABLE "FindingCitation" ADD CONSTRAINT "FindingCitation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- RLS on all pipeline tables (tenant-scoped case content / metadata).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['AnalysisRun','Finding','Report'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_policy_%s ON %I
         USING ("tenantId" = current_setting(''app.current_tenant_id'', true))
         WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      lower(t), t);
  END LOOP;
END $$;

ALTER TABLE "FindingCitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FindingCitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_findingcitation ON "FindingCitation"
  USING ("findingId" IN (SELECT id FROM "Finding" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("findingId" IN (SELECT id FROM "Finding" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));
