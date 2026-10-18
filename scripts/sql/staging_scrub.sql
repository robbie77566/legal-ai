-- Scrub a production copy for staging (run by scripts/staging-baseline.sh after
-- pg_restore; psql -v staging_hash=<bcrypt hash of the baseline password>).
--
-- What stays: case CONTENT — titles, facts, record text, chunks, findings,
-- reports, document rows, events, costs, promo codes, the migration ledger.
-- What goes: identities, contact details, credentials, tokens, card data, IPs,
-- user agents, free-text notes, leads, drafts, share links, in-flight uploads.
-- Staff (ADMIN/SUPPORT, or any @snotnoselegal.com address) keep their email so
-- the founder signs in to staging as themselves; everyone gets the baseline
-- password. Refuses to run on any database whose name does not end in _staging.
\set ON_ERROR_STOP on
BEGIN;

DO $$ BEGIN
  IF current_database() !~ '_staging$' THEN
    RAISE EXCEPTION 'staging_scrub refused: % is not a staging database', current_database();
  END IF;
END $$;

-- Accounts ------------------------------------------------------------------
UPDATE "User" SET
  email = CASE WHEN role IN ('ADMIN', 'SUPPORT') OR email ILIKE '%@snotnoselegal.com'
               THEN email ELSE 'client-' || left(md5(id), 10) || '@example.com' END,
  name  = CASE WHEN role IN ('ADMIN', 'SUPPORT') OR email ILIKE '%@snotnoselegal.com'
               THEN name  ELSE 'Client ' || left(md5(id), 6) END,
  "firstName" = NULL, "lastName" = NULL, phone = NULL,
  "passwordHash" = :'staging_hash', "passwordChangedAt" = now(),
  "pendingEmail" = NULL, "emailChangeToken" = NULL, "emailChangeExpires" = NULL,
  "inviteToken" = NULL, "inviteExpires" = NULL,
  "resetToken" = NULL, "resetExpires" = NULL;

UPDATE "Tenant" SET name = 'Tenant ' || left(md5(id), 6) WHERE id <> 'system-tenant';

-- Money ---------------------------------------------------------------------
UPDATE "Payment" SET "cardBrand" = NULL, "cardLast4" = NULL, "receiptUrl" = NULL;
UPDATE "Refund" SET note = NULL WHERE note IS NOT NULL;

-- Compliance & support ----------------------------------------------------
UPDATE "DisclosureAck" SET ip = '0.0.0.0', "userAgent" = NULL;
UPDATE "SupportNote" SET body = '[redacted: staging baseline]';
UPDATE "StaffRequest" SET note = NULL, "decisionNote" = NULL;
UPDATE "CaseFeedback" SET "decidedText" = NULL, "objectionText" = NULL;
UPDATE "AuditLog" SET details = jsonb_build_object('scrubbed', true);

-- Funnel --------------------------------------------------------------------
UPDATE "EligibilityLead" SET email = 'lead-' || left(md5(id), 10) || '@example.com';
DELETE FROM "EligibilityDraft";

-- Links and uploads that point at production ------------------------------
DELETE FROM "ShareLink";
DELETE FROM "UploadSession";

-- Email addresses inside JSON the family or the system wrote --------------
UPDATE "Case" SET facts = regexp_replace(facts::text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'redacted@example.com', 'g')::jsonb
  WHERE facts::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
UPDATE "CaseEvent" SET payload = regexp_replace(payload::text, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', 'redacted@example.com', 'g')::jsonb
  WHERE payload::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';

COMMIT;

SELECT 'users' AS what, count(*) FROM "User"
UNION ALL SELECT 'staff (email kept)', count(*) FROM "User" WHERE email NOT LIKE '%@example.com'
UNION ALL SELECT 'tenants', count(*) FROM "Tenant"
UNION ALL SELECT 'cases', count(*) FROM "Case"
UNION ALL SELECT 'documents', count(*) FROM "Document"
UNION ALL SELECT 'payments', count(*) FROM "Payment";
