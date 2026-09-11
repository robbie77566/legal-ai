-- Read-only inspection role for the production database (2026-09-11).
-- Run ONCE as the owner in Render → hg-postgres → Shell (psql). Replace the
-- password (openssl rand -base64 24 | tr -dc 'A-Za-z0-9'); it goes into the
-- dev box's .env.prod as PROD_DATABASE_URL. This role can SELECT and nothing
-- else — no writes, no DDL — so a debugging session cannot damage anything.
CREATE ROLE hg_readonly LOGIN PASSWORD '<PASSWORD>';
GRANT CONNECT ON DATABASE familycasereview_7ik1 TO hg_readonly;
GRANT USAGE ON SCHEMA public TO hg_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO hg_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO hg_readonly;
-- Tenant rows are RLS-protected; without the policies in step 2 below hg_readonly sees
-- ZERO rows (the owner bypasses RLS only as table owner).
-- Verify:  \du hg_readonly   then from the dev box:  pnpm prod:case <email>

-- ---------------------------------------------------------------------------
-- Step 2 (run as the owner, e.g. pgAdmin Query Tool): RLS otherwise hides EVERY row from
-- hg_readonly — the owner bypasses policies only because it owns the tables (found 2026-09-11).
-- A permissive SELECT-only policy per protected table; generated from the live catalog.
DROP POLICY IF EXISTS readonly_inspection ON "AnalysisRun";
CREATE POLICY readonly_inspection ON "AnalysisRun" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "AuditLog";
CREATE POLICY readonly_inspection ON "AuditLog" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Case";
CREATE POLICY readonly_inspection ON "Case" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "CaseAccess";
CREATE POLICY readonly_inspection ON "CaseAccess" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "CaseEvent";
CREATE POLICY readonly_inspection ON "CaseEvent" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "CaseFeedback";
CREATE POLICY readonly_inspection ON "CaseFeedback" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "ChecklistItem";
CREATE POLICY readonly_inspection ON "ChecklistItem" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "ConsentGrant";
CREATE POLICY readonly_inspection ON "ConsentGrant" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "CostRecord";
CREATE POLICY readonly_inspection ON "CostRecord" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "DisclosureAck";
CREATE POLICY readonly_inspection ON "DisclosureAck" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Document";
CREATE POLICY readonly_inspection ON "Document" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "DocumentChunk";
CREATE POLICY readonly_inspection ON "DocumentChunk" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "DocumentPage";
CREATE POLICY readonly_inspection ON "DocumentPage" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Finding";
CREATE POLICY readonly_inspection ON "Finding" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "FindingCitation";
CREATE POLICY readonly_inspection ON "FindingCitation" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Payment";
CREATE POLICY readonly_inspection ON "Payment" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Refund";
CREATE POLICY readonly_inspection ON "Refund" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "Report";
CREATE POLICY readonly_inspection ON "Report" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "ShareLink";
CREATE POLICY readonly_inspection ON "ShareLink" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "UploadSession";
CREATE POLICY readonly_inspection ON "UploadSession" FOR SELECT TO hg_readonly USING (true);
DROP POLICY IF EXISTS readonly_inspection ON "User";
CREATE POLICY readonly_inspection ON "User" FOR SELECT TO hg_readonly USING (true);
-- Verify from the dev box:  pnpm prod:case <email>
