-- Feature flags (persona_rollout_plan.md §5 J, §7 "Flags, not branches").
-- System tables: no RLS, read on the owner connection only; hg_app gets
-- nothing beyond the default privileges. Overrides are keyed by tenantId
-- (what RLS scopes on today); the Organisation model is 1:1 with Tenant.
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "FeatureFlagOverride" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureFlagOverride_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FeatureFlagOverride_flagKey_tenantId_key" ON "FeatureFlagOverride"("flagKey", "tenantId");
ALTER TABLE "FeatureFlagOverride"
  ADD CONSTRAINT "FeatureFlagOverride_flagKey_fkey" FOREIGN KEY ("flagKey") REFERENCES "FeatureFlag"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The six surfaces of the rollout plan, every one dark until an admin flips it.
INSERT INTO "FeatureFlag" ("key", "enabled", "description", "updatedAt") VALUES
  ('counsel_surfaces', false, 'Counsel-facing web surfaces: /for-counsel, /counsel and the matter pages', CURRENT_TIMESTAMP),
  ('counsel_checkout', false, 'Counsel checkout: the ladder, packs and the first-free review for attorneys', CURRENT_TIMESTAMP),
  ('offices',          false, 'Public-defender office organisations: allowances, ACH invoicing and the office admin', CURRENT_TIMESTAMP),
  ('record_desk',      false, 'Record Desk: the verification view and exports delivered from the staff console', CURRENT_TIMESTAMP),
  ('clinic_inbox',     false, 'Clinic consented-packet inbox and the public-interest allowance', CURRENT_TIMESTAMP),
  ('long_records',     false, 'Long records: the 2,000-page volume split and merge for offices', CURRENT_TIMESTAMP);
