-- Workstream J: the weekly eval gate (persona_rollout_plan.md §5 J, §7, §8).
-- Additive only. One SYSTEM table — EvalRun, one row per ledger per gate run —
-- read on the owner connection by the staff console and the GitHub workflow's
-- machine token. No RLS: the table is not tenant data; caseId / runId /
-- tenantId are plain references so the gate history survives a deleted eval
-- case.

-- ── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "EvalRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SCORED', 'FAILED');

-- ── EvalRun ──────────────────────────────────────────────────────────────────
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "ledger" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT,
    "status" "EvalRunStatus" NOT NULL DEFAULT 'QUEUED',
    "scorecard" JSONB,
    "pass" BOOLEAN,
    "reasons" JSONB,
    "bucket" TEXT,
    "meteredPages" JSONB,
    "costCents" INTEGER,
    "error" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EvalRun_startedAt_idx" ON "EvalRun"("startedAt");
CREATE INDEX "EvalRun_ledger_startedAt_idx" ON "EvalRun"("ledger", "startedAt");
