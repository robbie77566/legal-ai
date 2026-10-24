-- Backup email (your_account "Backup email (2026-10-24)"): a second address a
-- signed-in person verifies from a link sent to it, then used for account
-- recovery and security notices. Additive only; four nullable columns on the
-- global User table (no RLS policy there). No uniqueness on "backupEmail" —
-- two accounts may name the same recovery address; the api refuses a backup
-- that equals any account's primary "email".
ALTER TABLE "User"
  ADD COLUMN "backupEmail" TEXT,
  ADD COLUMN "backupEmailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "backupEmailToken" TEXT,
  ADD COLUMN "backupEmailExpires" TIMESTAMP(3);
