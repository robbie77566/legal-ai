-- Workstream I: clinics, offices, investigation layer (persona_rollout_plan.md
-- §5 I). Additive only. Three new tenant tables — Invitation (a seat offered
-- to a colleague), PacketDelivery (a consented packet in a clinic's inbox,
-- scoped to the CLINIC's tenant), InvestigationRequest (a Record Desk request)
-- — each with the usual tenant_isolation_policy; two columns on Organisation
-- (the public-interest allowance flag, the security contact) and one on
-- ConsentGrant (the clinic the family named, nullable).

-- ── Enums ────────────────────────────────────────────────────────────────────
CREATE TYPE "InvestigationKind" AS ENUM ('CHRONOLOGY', 'RECORDS_TRACKER', 'OTHER');
CREATE TYPE "InvestigationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DELIVERED', 'DECLINED');

-- ── Organisation: public-interest allowance flag + security contact ─────────
ALTER TABLE "Organisation"
  ADD COLUMN "publicInterest" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "securityContact" TEXT;

-- ── ConsentGrant: the clinic the family named (null = any clinic) ───────────
ALTER TABLE "ConsentGrant" ADD COLUMN "recipientOrganisationId" TEXT;

-- ── Invitation ───────────────────────────────────────────────────────────────
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");
CREATE INDEX "Invitation_organisationId_email_idx" ON "Invitation"("organisationId", "email");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── PacketDelivery (tenantId = the clinic's tenant) ──────────────────────────
CREATE TABLE "PacketDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "sourceTenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "consentGrantId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedAt" TIMESTAMP(3),
    "openedBy" TEXT,
    CONSTRAINT "PacketDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PacketDelivery_organisationId_reportId_key" ON "PacketDelivery"("organisationId", "reportId");
CREATE INDEX "PacketDelivery_tenantId_deliveredAt_idx" ON "PacketDelivery"("tenantId", "deliveredAt");
ALTER TABLE "PacketDelivery" ADD CONSTRAINT "PacketDelivery_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── InvestigationRequest ─────────────────────────────────────────────────────
CREATE TABLE "InvestigationRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "caseId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "kind" "InvestigationKind" NOT NULL,
    "pages" INTEGER,
    "dueBy" TIMESTAMP(3),
    "note" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'OPEN',
    "assignedTo" TEXT,
    "staffNote" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InvestigationRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvestigationRequest_tenantId_createdAt_idx" ON "InvestigationRequest"("tenantId", "createdAt");
CREATE INDEX "InvestigationRequest_status_idx" ON "InvestigationRequest"("status");
ALTER TABLE "InvestigationRequest" ADD CONSTRAINT "InvestigationRequest_organisationId_fkey"
  FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── RLS: all three are tenant data (ENABLE without FORCE, as since 20260901000012) ──
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_invitation ON "Invitation";
CREATE POLICY tenant_isolation_policy_invitation ON "Invitation"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "PacketDelivery" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_packetdelivery ON "PacketDelivery";
CREATE POLICY tenant_isolation_policy_packetdelivery ON "PacketDelivery"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "InvestigationRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_investigationrequest ON "InvestigationRequest";
CREATE POLICY tenant_isolation_policy_investigationrequest ON "InvestigationRequest"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
