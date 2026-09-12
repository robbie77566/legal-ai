-- Case summary on each analysis run (report header): grounded facts from the record.
ALTER TABLE "AnalysisRun" ADD COLUMN "summary" JSONB;
