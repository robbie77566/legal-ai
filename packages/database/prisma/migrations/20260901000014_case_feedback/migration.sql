CREATE TABLE "CaseFeedback" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clarity" INTEGER,
    "recommend" TEXT,
    "decidedText" TEXT,
    "sharedWithLawyer" TEXT,
    "objectionText" TEXT,
    "followupSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CaseFeedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CaseFeedback_caseId_key" ON "CaseFeedback"("caseId");

ALTER TABLE "CaseFeedback" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_casefeedback ON "CaseFeedback"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
