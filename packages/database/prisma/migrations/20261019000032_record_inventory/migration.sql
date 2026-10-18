-- Record inventory and volume recognition (persona_rollout_plan.md §4, §5 D;
-- January slice: the uploader labels volumes, the meter sets the bucket).
-- Additive only. Document and Case already carry tenant_isolation_policy_*
-- (20260512000000_rls_and_audit, 20260829000001_rls_with_check_and_app_role),
-- so the new columns inherit RLS; no new table, no new policy.

-- ── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE "VolumeKind" AS ENUM ('REPORTER', 'CLERK', 'EXHIBIT', 'UNKNOWN');

-- ── Document: which volume of the record this file is ────────────────────────
ALTER TABLE "Document"
  ADD COLUMN "volumeKind" "VolumeKind" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "volumeLabel" TEXT,
  ADD COLUMN "volumeIndex" INTEGER,
  ADD COLUMN "volumeCount" INTEGER,
  ADD COLUMN "volumeConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ocrConfidence" DOUBLE PRECISION;

-- ── Case: the meter projection (written only by recomputeMeter) ──────────────
ALTER TABLE "Case"
  ADD COLUMN "recordBucket" TEXT,
  ADD COLUMN "meteredPages" JSONB,
  ADD COLUMN "inventoryAt" TIMESTAMP(3);
