-- OPS-6 support contact log + request-to-Admin flow (staff_console_access_model §6).
CREATE TYPE "StaffRequestType" AS ENUM ('REFUND', 'CASE_DELETE', 'ACCOUNT_DELETE');
CREATE TYPE "StaffRequestDecision" AS ENUM ('APPROVED', 'DECLINED');

CREATE TABLE "SupportNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportNote_caseId_idx" ON "SupportNote"("caseId");

CREATE TABLE "StaffRequest" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "StaffRequestType" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "amountCents" INTEGER,
    "requestedBy" TEXT NOT NULL,
    "decision" "StaffRequestDecision",
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "StaffRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffRequest_caseId_idx" ON "StaffRequest"("caseId");
CREATE INDEX "StaffRequest_decision_idx" ON "StaffRequest"("decision");
-- One OPEN request per case and type; decided ones stack as history.
CREATE UNIQUE INDEX "StaffRequest_open_unique" ON "StaffRequest"("caseId", "type") WHERE "decision" IS NULL;
