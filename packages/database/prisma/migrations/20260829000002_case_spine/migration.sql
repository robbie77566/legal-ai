-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'AWAITING_DOCS', 'DOCS_COMPLETE', 'DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW', 'QA_REJECTED', 'READY', 'DELIVERED', 'REFUNDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Lane" AS ENUM ('TRIAL', 'PLEA');

-- CreateEnum
CREATE TYPE "ChecklistItemState" AS ENUM ('NEEDED', 'UPLOADED', 'CONFIRMED', 'PROBLEM');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "convictionYear" INTEGER,
ADD COLUMN     "county" TEXT,
ADD COLUMN     "delayOurs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expectedReadyAt" TIMESTAMP(3),
ADD COLUMN     "lane" "Lane",
ADD COLUMN     "ocrHalt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slaStartedAt" TIMESTAMP(3),
ADD COLUMN     "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "subsequentWrit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vehicle" TEXT;

-- CreateTable
CREATE TABLE "CaseEvent" (
    "id" BIGSERIAL NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityDraft" (
    "token" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EligibilityDraft_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "state" "ChecklistItemState" NOT NULL DEFAULT 'NEEDED',
    "howToKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadSession" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseEvent_caseId_id_idx" ON "CaseEvent"("caseId", "id");

-- CreateIndex
CREATE INDEX "CaseEvent_publishedAt_idx" ON "CaseEvent"("publishedAt");

-- CreateIndex
CREATE INDEX "EligibilityDraft_expiresAt_idx" ON "EligibilityDraft"("expiresAt");

-- CreateIndex
CREATE INDEX "ChecklistItem_caseId_idx" ON "ChecklistItem"("caseId");

-- CreateIndex
CREATE INDEX "UploadSession_caseId_idx" ON "UploadSession"("caseId");

-- CreateIndex
CREATE INDEX "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

-- CreateIndex
CREATE INDEX "Case_tenantId_status_idx" ON "Case"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Hand-written hardening (not expressible in the Prisma schema) ────────────

-- CaseEvent is append-only, same contract as AuditLog (ENG-1: events are
-- immutable; projections rebuild from the stream). publishedAt is the ONE
-- exception: the outbox publisher stamps it exactly once (null → timestamp).
CREATE OR REPLACE FUNCTION enforce_append_only_case_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'CaseEvent is append-only. DELETE is forbidden.';
    END IF;
    IF OLD."publishedAt" IS NULL AND NEW."publishedAt" IS NOT NULL
       AND NEW.id = OLD.id AND NEW."caseId" = OLD."caseId"
       AND NEW."tenantId" = OLD."tenantId" AND NEW.type = OLD.type
       AND NEW.version = OLD.version AND NEW.payload::text = OLD.payload::text
       AND NEW.actor = OLD.actor AND NEW."createdAt" = OLD."createdAt" THEN
        RETURN NEW; -- outbox publish stamp only
    END IF;
    RAISE EXCEPTION 'CaseEvent is append-only. Only the outbox publishedAt stamp may be written.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_case_event_append_only
BEFORE UPDATE OR DELETE ON "CaseEvent"
FOR EACH ROW EXECUTE FUNCTION enforce_append_only_case_event();

-- RLS: CaseEvent carries a denormalized tenantId precisely so events remain
-- policy-scoped after their Case is hard-deleted (retention matrix §11a.2).
ALTER TABLE "CaseEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CaseEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_case_event ON "CaseEvent"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "ChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_checklist ON "ChecklistItem"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

ALTER TABLE "UploadSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UploadSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_upload_session ON "UploadSession"
  USING ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)))
  WITH CHECK ("caseId" IN (SELECT id FROM "Case" WHERE "tenantId" = current_setting('app.current_tenant_id', true)));

-- EligibilityDraft is deliberately NOT under RLS: it is anonymous, pre-tenant
-- data keyed by an opaque token and only reachable through the owner
-- connection's token-addressed queries (ENG-7).
