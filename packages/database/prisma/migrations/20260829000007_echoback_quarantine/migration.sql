-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "classificationConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quarantined" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggestedChecklistItemId" TEXT;

