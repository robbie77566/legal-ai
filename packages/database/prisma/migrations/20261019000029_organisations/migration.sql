-- Identity EXPAND step (persona_rollout_plan.md §5 A, §7 "Deploy discipline";
-- Staff Console Access Model). Additive only: `Role` and every gate that
-- reads it keep working. This migration adds the target model beside it —
-- AccountKind on the user, StaffGrant as a set per staff member, Organisation
-- as the 1:1 profile of a Tenant, Membership as a seat in it — and backfills
-- both from the Role column. The CONTRACT step (dropping Role and switching
-- the gates to grants) is a later, founder-run migration.
--
-- The backfill between the BACKFILL BEGIN/END markers is idempotent and is
-- re-run by apps/api/tests/organisations.integration.test.ts against users
-- created in the old shape, so it is proven on a populated database.

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "AccountKind" AS ENUM ('FAMILY', 'PROFESSIONAL', 'STAFF');
CREATE TYPE "StaffGrantKind" AS ENUM ('ADMIN', 'SUPPORT', 'REVIEWER');
CREATE TYPE "OrganisationKind" AS ENUM ('FIRM', 'PD_OFFICE', 'CLINIC', 'FAMILY');
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER');

-- ── User: account kind + professional profile ────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "accountKind" "AccountKind" NOT NULL DEFAULT 'FAMILY',
  ADD COLUMN "barNumber" TEXT,
  ADD COLUMN "barState" TEXT,
  ADD COLUMN "barVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "barVerifiedBy" TEXT,
  ADD COLUMN "practiceType" TEXT;

-- ── Organisation (1:1 with Tenant so RLS stays tenant-scoped) ────────────────
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "OrganisationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "billingEmail" TEXT,
    "pilot" BOOLEAN NOT NULL DEFAULT false,
    "pilotEndsAt" TIMESTAMP(3),
    "allowanceRecords" INTEGER NOT NULL DEFAULT 0,
    "allowanceResetsAt" TIMESTAMP(3),
    "features" JSONB NOT NULL DEFAULT '{}',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Organisation_tenantId_key" ON "Organisation"("tenantId");
ALTER TABLE "Organisation" ADD CONSTRAINT "Organisation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Membership (tenantId denormalised for the RLS policy) ────────────────────
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "invitedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE INDEX "Membership_tenantId_idx" ON "Membership"("tenantId");
CREATE UNIQUE INDEX "Membership_organisationId_userId_key" ON "Membership"("organisationId", "userId");
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── StaffGrant (a set per person; revocation is a timestamp) ─────────────────
CREATE TABLE "StaffGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "StaffGrantKind" NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "StaffGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffGrant_userId_kind_key" ON "StaffGrant"("userId", "kind");
ALTER TABLE "StaffGrant" ADD CONSTRAINT "StaffGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS: Organisation and Membership are tenant data ─────────────────────────
-- ENABLE without FORCE (20260901000012_rls_no_force): the owner connection is
-- the system surface; hg_app is policy-bound. StaffGrant is a system table
-- (staff hold no tenant data) and is read only on the owner connection.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_organisation ON "Organisation";
CREATE POLICY tenant_isolation_policy_organisation ON "Organisation"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_membership ON "Membership";
CREATE POLICY tenant_isolation_policy_membership ON "Membership"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Backfill from Role (staff_console.md §1: every non-CLIENT role is staff) ─
-- BACKFILL BEGIN
-- CLIENT → FAMILY is the column default. Only rows still at the default move,
-- so a re-run never touches a PROFESSIONAL (role CLIENT, kind PROFESSIONAL).
UPDATE "User"
   SET "accountKind" = 'STAFF'
 WHERE "role" IN ('ADMIN', 'SUPPORT', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER')
   AND "accountKind" = 'FAMILY';

-- ADMIN → ADMIN, SUPPORT → SUPPORT, ATTORNEY → REVIEWER. INVESTIGATOR and
-- VIEWER have no staff console surface today and get no grant; the role
-- fallback in packages/database/staff.ts keeps whatever they can do now.
INSERT INTO "StaffGrant" ("id", "userId", "kind", "grantedBy", "grantedAt")
SELECT gen_random_uuid()::text,
       u."id",
       CASE u."role"
         WHEN 'ADMIN' THEN 'ADMIN'::"StaffGrantKind"
         WHEN 'SUPPORT' THEN 'SUPPORT'::"StaffGrantKind"
         WHEN 'ATTORNEY' THEN 'REVIEWER'::"StaffGrantKind"
       END,
       'migration:20261019000029_organisations',
       CURRENT_TIMESTAMP
  FROM "User" u
 WHERE u."role" IN ('ADMIN', 'SUPPORT', 'ATTORNEY')
   AND u."deletedAt" IS NULL
ON CONFLICT ("userId", "kind") DO NOTHING;
-- BACKFILL END
