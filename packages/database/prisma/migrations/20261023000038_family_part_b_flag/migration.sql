-- UPL review 2026-10-23 (docs/compliance/upl_review_2026-10-23.md, findings
-- E2 and E3; recommendations 5 and 11).
--
-- family_part_b: whether the family report carries Part B, the preservation
-- call, the harm standard, the vehicle and the develop steps inline. Off
-- (the conservative default while counsel question 3 is open) the family
-- receives Part A and a sealed attorney packet. A flip is a row update.
INSERT INTO "FeatureFlag" ("key", "enabled", "description", "updatedAt") VALUES
  ('family_part_b', false, 'Show Part B, preservation, harm standard, vehicle and develop steps inside the family report; off = sealed attorney packet only', CURRENT_TIMESTAMP);

-- Advice-language lint (E3): the hits found on a finding's stored text at
-- analysis time, read by the QA console; null when the text is clean.
ALTER TABLE "Finding" ADD COLUMN "lintFlags" JSONB;
