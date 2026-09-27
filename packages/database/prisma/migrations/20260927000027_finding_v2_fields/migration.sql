-- Prompt set v2: the fields a manual appellate review tracks per issue.
ALTER TABLE "Finding" ADD COLUMN "preserved" TEXT;
ALTER TABLE "Finding" ADD COLUMN "preservedCite" TEXT;
ALTER TABLE "Finding" ADD COLUMN "harmStandard" TEXT;
ALTER TABLE "Finding" ADD COLUMN "vehicle" TEXT;
ALTER TABLE "Finding" ADD COLUMN "develop" TEXT;
ALTER TABLE "Finding" ADD COLUMN "dependsOn" TEXT[] DEFAULT ARRAY[]::TEXT[];
