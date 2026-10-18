-- Price book, credits, allowances, quotes and invoices (persona_rollout_plan.md
-- §4, §5 B — the persistence half of workstream B). Additive only. The
-- decisions stay in packages/case-lifecycle/pricing; these tables store what
-- it needs (the book, the credits, the allowance usage) and what it decided
-- (the QUOTED case state, quote requests, invoices).

-- ── Enums ────────────────────────────────────────────────────────────────────
-- Counsel cases wait here between the page meter and payment; families never
-- enter it (the machine in @hg/case-lifecycle allows DOCS_COMPLETE → QUOTED →
-- DIGITIZING only).
ALTER TYPE "CaseStatus" ADD VALUE 'QUOTED' AFTER 'DOCS_COMPLETE';
-- A prepaid five-record pack is a Payment too (money is one ledger).
ALTER TYPE "PaymentKind" ADD VALUE 'PACK';

CREATE TYPE "AllowanceKind" AS ENUM ('PILOT', 'PUBLIC_INTEREST', 'OFFICE');
CREATE TYPE "QuoteRequestStatus" AS ENUM ('OPEN', 'QUOTED', 'DECLINED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'VOID');

-- ── Payment: attributable by SKU and rung ────────────────────────────────────
ALTER TABLE "Payment"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "rung" TEXT;

-- ── PromoCode: monthly cap and audience (promo_codes.md §5) ──────────────────
ALTER TABLE "PromoCode"
  ADD COLUMN "maxRedemptionsPerMonth" INTEGER,
  ADD COLUMN "audience" TEXT;

-- ── PriceBookRow (system table, seeded below) ────────────────────────────────
CREATE TABLE "PriceBookRow" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripePriceId" TEXT,
    "label" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "terms" JSONB,
    "purchasable" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PriceBookRow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceBookRow_audience_sku_idx" ON "PriceBookRow"("audience", "sku");
CREATE UNIQUE INDEX "PriceBookRow_audience_sku_effectiveFrom_key" ON "PriceBookRow"("audience", "sku", "effectiveFrom");

-- ── Credit ───────────────────────────────────────────────────────────────────
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT,
    "userId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "rung" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "consumedCaseId" TEXT,
    "paymentId" TEXT,
    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Credit_tenantId_consumedAt_idx" ON "Credit"("tenantId", "consumedAt");
CREATE INDEX "Credit_consumedCaseId_idx" ON "Credit"("consumedCaseId");

-- ── AllowanceEntry (one per record; caseId unique = idempotent decrement) ────
CREATE TABLE "AllowanceEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "AllowanceKind" NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedBy" TEXT NOT NULL,
    CONSTRAINT "AllowanceEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllowanceEntry_caseId_key" ON "AllowanceEntry"("caseId");
CREATE INDEX "AllowanceEntry_organisationId_idx" ON "AllowanceEntry"("organisationId");
CREATE INDEX "AllowanceEntry_tenantId_idx" ON "AllowanceEntry"("tenantId");

-- ── QuoteRequest ─────────────────────────────────────────────────────────────
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "meteredPages" JSONB NOT NULL,
    "note" TEXT,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'OPEN',
    "quotedCents" INTEGER,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteRequest_tenantId_idx" ON "QuoteRequest"("tenantId");
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");
CREATE INDEX "QuoteRequest_caseId_idx" ON "QuoteRequest"("caseId");

-- ── Invoice ──────────────────────────────────────────────────────────────────
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidBy" TEXT,
    "achReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");
CREATE INDEX "Invoice_organisationId_idx" ON "Invoice"("organisationId");
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- ── RLS: the four tenant tables ──────────────────────────────────────────────
-- ENABLE without FORCE (20260901000012_rls_no_force): the owner connection is
-- the system surface (ops reads), hg_app is policy-bound. PriceBookRow is a
-- system table (the operator's prices) and carries no policy.
ALTER TABLE "Credit" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_credit ON "Credit";
CREATE POLICY tenant_isolation_policy_credit ON "Credit"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "AllowanceEntry" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_allowanceentry ON "AllowanceEntry";
CREATE POLICY tenant_isolation_policy_allowanceentry ON "AllowanceEntry"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "QuoteRequest" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_quoterequest ON "QuoteRequest";
CREATE POLICY tenant_isolation_policy_quoterequest ON "QuoteRequest"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy_invoice ON "Invoice";
CREATE POLICY tenant_isolation_policy_invoice ON "Invoice"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- ── Seed: DEFAULT_PRICE_BOOK, row for row ────────────────────────────────────
-- Hand-copied from packages/case-lifecycle/pricing/price-book.ts;
-- apps/api/tests/price-book.integration.test.ts asserts the table equals it.
-- Family rows are in effect from 2025-01-01, professional rows from
-- 2026-01-01. stripePriceId stays null: the STRIPE_PRICE_* env fills it at
-- read time, and an unset env means Checkout uses price_data with `cents`.
INSERT INTO "PriceBookRow" ("id", "audience", "sku", "cents", "currency", "label", "effectiveFrom", "terms", "purchasable") VALUES
  -- Families — unchanged
  ('pb_family_review',          'FAMILY',   'REVIEW',            29900,   'usd', 'Family Case Review — up to 5,000 pages',                              '2025-01-01 00:00:00', NULL, true),
  ('pb_family_overage',         'FAMILY',   'OVERAGE',           4900,    'usd', 'Additional pages (+2,500)',                                            '2025-01-01 00:00:00', NULL, true),
  ('pb_family_rerun',           'FAMILY',   'RERUN',             9900,    'usd', 'Re-run with new documents',                                            '2025-01-01 00:00:00', NULL, true),
  -- Attorneys — the counsel ladder
  ('pb_attorney_short',         'ATTORNEY', 'COUNSEL_SHORT',     14900,   'usd', 'Counsel Review Short (<100 pages)',                                    '2026-01-01 00:00:00', NULL, true),
  ('pb_attorney_standard',      'ATTORNEY', 'COUNSEL_STANDARD',  24900,   'usd', 'Counsel Review Standard (100–500 pages)',                              '2026-01-01 00:00:00', NULL, true),
  ('pb_attorney_extended',      'ATTORNEY', 'COUNSEL_EXTENDED',  34900,   'usd', 'Counsel Review Extended (501–1,500 pages)',                            '2026-01-01 00:00:00', NULL, true),
  ('pb_attorney_long',          'ATTORNEY', 'COUNSEL_LONG',      49900,   'usd', 'Long record (>1,500 pages) — quote from $499',                         '2026-01-01 00:00:00', '{"kind":"QUOTE_FROM"}', false),
  ('pb_attorney_rerun',         'ATTORNEY', 'RERUN',             9900,    'usd', 'Re-run with new documents',                                            '2026-01-01 00:00:00', NULL, true),
  ('pb_attorney_pack_short',    'ATTORNEY', 'PACK_SHORT',        67050,   'usd', 'Five-record pack, Short rung (10% off, 12 months)',                    '2026-01-01 00:00:00', '{"kind":"PACK","rung":"SHORT","records":5,"discountPercent":10,"expiryMonths":12}', true),
  ('pb_attorney_pack_standard', 'ATTORNEY', 'PACK_STANDARD',     112050,  'usd', 'Five-record pack, Standard rung (10% off, 12 months)',                 '2026-01-01 00:00:00', '{"kind":"PACK","rung":"STANDARD","records":5,"discountPercent":10,"expiryMonths":12}', true),
  ('pb_attorney_pack_extended', 'ATTORNEY', 'PACK_EXTENDED',     157050,  'usd', 'Five-record pack, Extended rung (10% off, 12 months)',                 '2026-01-01 00:00:00', '{"kind":"PACK","rung":"EXTENDED","records":5,"discountPercent":10,"expiryMonths":12}', true),
  ('pb_attorney_first_free',    'ATTORNEY', 'FIRST_REVIEW_FREE', 0,       'usd', 'First review free (≤500 pages, verified bar number, monthly cap)',     '2026-01-01 00:00:00', '{"kind":"FREE_FIRST","maxPages":500,"requiresBarVerification":true,"monthCap":10}', false),
  ('pb_attorney_partner_code',  'ATTORNEY', 'PARTNER_CODE',      0,       'usd', 'Bar-partner code — 15% off the first paid review',                     '2026-01-01 00:00:00', '{"kind":"PARTNER_CODE","discountPercent":15,"firstPaidOnly":true}', false),
  -- Public defender offices
  ('pb_office_50',              'OFFICE',   'OFFICE_50',         900000,  'usd', 'Office 50 — 50 records a year, unlimited users, ACH invoice',          '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":50,"periodDays":365,"tier":50}', true),
  ('pb_office_120',             'OFFICE',   'OFFICE_120',        1800000, 'usd', 'Office 120 — 120 records a year, unlimited users, ACH invoice',        '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":120,"periodDays":365,"tier":120}', true),
  ('pb_office_250',             'OFFICE',   'OFFICE_250',        3000000, 'usd', 'Office 250 — 250 records a year, unlimited users, ACH invoice',        '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":250,"periodDays":365,"tier":250}', true),
  ('pb_office_pilot',           'OFFICE',   'PD_PILOT',          0,       'usd', 'PD pilot — 15 records, 90 days, free',                                 '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":15,"periodDays":90}', false),
  ('pb_office_rerun',           'OFFICE',   'RERUN',             9900,    'usd', 'Re-run with new documents',                                            '2026-01-01 00:00:00', NULL, true),
  -- Clinics
  ('pb_clinic_public_interest', 'CLINIC',   'PUBLIC_INTEREST',   0,       'usd', 'Public-interest — 25 records a year at $0',                            '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":25,"periodDays":365}', false),
  ('pb_clinic_office_50',       'CLINIC',   'OFFICE_50',         900000,  'usd', 'Office 50 — 50 records a year, unlimited users, ACH invoice',          '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":50,"periodDays":365,"tier":50}', true),
  ('pb_clinic_office_120',      'CLINIC',   'OFFICE_120',        1800000, 'usd', 'Office 120 — 120 records a year, unlimited users, ACH invoice',        '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":120,"periodDays":365,"tier":120}', true),
  ('pb_clinic_office_250',      'CLINIC',   'OFFICE_250',        3000000, 'usd', 'Office 250 — 250 records a year, unlimited users, ACH invoice',        '2026-01-01 00:00:00', '{"kind":"ALLOWANCE","records":250,"periodDays":365,"tier":250}', true),
  ('pb_clinic_rerun',           'CLINIC',   'RERUN',             9900,    'usd', 'Re-run with new documents',                                            '2026-01-01 00:00:00', NULL, true);
