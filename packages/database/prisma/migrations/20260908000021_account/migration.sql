-- Family account page (your_account spec): email change with confirmation;
-- receipt details on the ledger.
ALTER TABLE "User"
  ADD COLUMN "pendingEmail" TEXT,
  ADD COLUMN "emailChangeToken" TEXT,
  ADD COLUMN "emailChangeExpires" TIMESTAMP(3);
ALTER TABLE "Payment"
  ADD COLUMN "cardBrand" TEXT,
  ADD COLUMN "cardLast4" TEXT,
  ADD COLUMN "receiptUrl" TEXT;
