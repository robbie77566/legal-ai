-- Pending-appeal leads (customer_journey_ux_review G-E1).
CREATE TABLE "EligibilityLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EligibilityLead_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EligibilityLead_remindAt_idx" ON "EligibilityLead"("remindAt");
