-- Sign-in log (staff_console.md §12 "Sign-in log and alerts", 2026-10-31):
-- one row per credential sign-in attempt, written by the web's authorize()
-- and read by the staff console. A SYSTEM table like "FeatureFlag" — no row
-- level security; it is written and read on the owner connection only and is
-- never joined into tenant data. Additive only. Rows older than 180 days are
-- deleted by the api's hourly sweep (pruneSignInAttempts).
CREATE TYPE "SignInOutcome" AS ENUM ('SUCCESS', 'BAD_PASSWORD', 'UNKNOWN_EMAIL', 'RATE_LIMITED', 'NO_PASSWORD');

CREATE TABLE "SignInAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "tenantId" TEXT,
    "outcome" "SignInOutcome" NOT NULL,
    "firstSignIn" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignInAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignInAttempt_createdAt_idx" ON "SignInAttempt"("createdAt");
CREATE INDEX "SignInAttempt_userId_idx" ON "SignInAttempt"("userId");
CREATE INDEX "SignInAttempt_email_idx" ON "SignInAttempt"("email");
