-- Which screen grounded a finding. Screens sweep the whole record, so two of
-- them can surface the same passage; recording the origin lets the union keep
-- one finding while still showing every screen that found it, and lets the
-- report group by the canonical trial-process categories instead of repeating
-- one issue under several model-written labels.
ALTER TABLE "Finding" ADD COLUMN "screen" TEXT;
ALTER TABLE "Finding" ADD COLUMN "alsoFoundBy" TEXT[] DEFAULT ARRAY[]::TEXT[];
