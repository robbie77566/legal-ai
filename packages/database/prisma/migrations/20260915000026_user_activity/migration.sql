-- Admin Accounts page activity: last sign-in and sign-in count on the user;
-- visits (runs of signed-in activity) for visit count and time on site.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "loginCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "UserVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "pageViews" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "UserVisit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserVisit_userId_lastSeenAt_idx" ON "UserVisit"("userId", "lastSeenAt");
