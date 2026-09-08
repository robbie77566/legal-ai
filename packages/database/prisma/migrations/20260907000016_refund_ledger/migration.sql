-- OPS-2 refund ledger. A refund used to be a status flip with no amount, no
-- Stripe id and no timestamp; the webhook that flipped it matched on the
-- payment-intent id against a column that holds the checkout-session id, so
-- in production it matched nothing. This migration gives Payment the ids
-- Stripe actually keys refunds/disputes by, a refunded rollup, and a Refund
-- table so partial refunds stack and weekly totals are sums.

ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

ALTER TABLE "Payment"
  ADD COLUMN "paymentIntentId" TEXT,
  ADD COLUMN "chargeId" TEXT,
  ADD COLUMN "refundedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refundedAt" TIMESTAMP(3),
  ADD COLUMN "disputedAt" TIMESTAMP(3),
  ADD COLUMN "disputeStatus" TEXT;

CREATE INDEX "Payment_paymentIntentId_idx" ON "Payment"("paymentIntentId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "stripeRefundId" TEXT NOT NULL,
    "caseId" TEXT,
    "tenantId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "issuedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
CREATE INDEX "Refund_tenantId_idx" ON "Refund"("tenantId");
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");

-- Tenant-scoped financial data, same isolation as Payment.
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy_refund ON "Refund"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
