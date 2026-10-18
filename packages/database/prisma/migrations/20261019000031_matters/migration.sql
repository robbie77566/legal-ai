-- Matter intake for counsel (persona_rollout_plan.md §5 C). Additive only:
-- one new tenant table, 1:1 with "Case" through "caseId". A professional
-- opens a matter instead of taking the family quiz; the matter carries the
-- vehicle chosen up front and the dates the TRAP clock reads. Client
-- identity is initials only — there is deliberately no name column.

-- ── Matter ───────────────────────────────────────────────────────────────────
CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "openedBy" TEXT NOT NULL,
    "vehicle" TEXT NOT NULL,
    "lane" "Lane",
    "county" TEXT NOT NULL,
    "court" TEXT,
    "causeNumber" TEXT,
    "clientInitials" TEXT NOT NULL,
    "offence" TEXT,
    "sentence" TEXT,
    "judgmentSignedAt" DATE,
    "sentenceImposedAt" DATE,
    "noticeOfAppealFiledAt" DATE,
    "recordFiledAt" DATE,
    "priorWrits" INTEGER NOT NULL DEFAULT 0,
    "subsequentWrit" BOOLEAN NOT NULL DEFAULT false,
    "outsideRecordNote" TEXT,
    "capital" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Matter_caseId_key" ON "Matter"("caseId");
CREATE INDEX "Matter_tenantId_organisationId_idx" ON "Matter"("tenantId", "organisationId");
CREATE INDEX "Matter_openedBy_idx" ON "Matter"("openedBy");
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS: a matter is tenant data ─────────────────────────────────────────────
-- ENABLE without FORCE (20260901000012_rls_no_force): the owner connection is
-- the system surface; hg_app is policy-bound.
ALTER TABLE "Matter" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_matter ON "Matter";
CREATE POLICY tenant_isolation_policy_matter ON "Matter"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
