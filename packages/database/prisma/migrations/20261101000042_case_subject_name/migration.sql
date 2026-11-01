-- The name of the person in custody (the founder's ask, 2026-11-01: "in the
-- cases view, add the name of person in jail as well as the account holder").
-- One nullable free-text column on the tenant-scoped "Case" table, captured by
-- the family interview and shown to the family and to staff only. Additive;
-- the existing tenant_isolation_policy_case covers it. Deletion removes the
-- Case row, so nothing here outlives the case.
ALTER TABLE "Case" ADD COLUMN "subjectName" TEXT;
