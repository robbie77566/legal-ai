-- U4: lawyer gates (UPL review 2026-10-23, recommendations 4 and 9; findings
-- P1, P2, P3, P10). Additive only. No new table: three columns on User (the
-- staff decision on the bar number, backfilled VERIFIED where a verification
-- already stands), three on Organisation (staff-verified clinic with the
-- supervising attorney's bar number on file) and one on InvestigationRequest
-- (the structured chronology the Record Desk delivers). Every table here
-- already carries its RLS policy (or is the global User table), so nothing
-- changes in the policies.

-- ── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "BarVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- ── User: the decision on the bar number ────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "barVerificationStatus" "BarVerificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "barRejectedAt" TIMESTAMP(3),
  ADD COLUMN "barRejectionNote" TEXT;

-- A verification that already stands is VERIFIED; everyone else waits.
UPDATE "User" SET "barVerificationStatus" = 'VERIFIED' WHERE "barVerifiedAt" IS NOT NULL;

-- ── Organisation: staff-verified clinic ──────────────────────────────────────
ALTER TABLE "Organisation"
  ADD COLUMN "clinicVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "clinicSupervisingBar" TEXT,
  ADD COLUMN "clinicVerifiedBy" TEXT;

-- ── InvestigationRequest: the structured chronology ──────────────────────────
ALTER TABLE "InvestigationRequest" ADD COLUMN "deliverable" JSONB;
