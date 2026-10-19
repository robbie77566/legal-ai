# Security one-pager — for public defender offices and innocence clinics

**Draft for founder review (workstream I, 2026-10-19).** One page, text only, for the office and clinic sales motion (`persona_rollout_plan.md` §3 "W-9, DPA, security one-pager"). Every statement below is checked against the code or the operations documents it cites; anything a prospect asks that is not here goes to the security contact, not to a guess. Bracketed items are the founder's to confirm before the page ships.

---

## Who we are and what we hold

Snot Nose Legal reads a Texas criminal trial record (reporter's record, clerk's record, exhibits) and returns a cited review. For an office or clinic we hold: the record you upload, the pages we extract from it, the findings and the report we render, and your organisation's members and matters. We do not hold an inmate's name as a field: a matter is identified by county, conviction year and a short reference, and your own matter title.

## Hosting

- Application, database and queues run on Render (US). Documents and the OCR pass live in AWS (S3, Textract), region `us-east-2`. [Founder: confirm the Render region to name.]
- The database is Postgres 16 with native point-in-time recovery; backups expire after 35 days, so a deletion propagates fully within 35 days (`mvp_v1_system_design.md` §11a.2).
- Each environment (staging, production) has its own buckets, keys, database and email allow-list; staging never holds production data (`persona_rollout_plan.md` §7).

## Encryption

- In transit: TLS everywhere — browser to site, site to API, API to AWS, Stripe, Resend and the model provider. Session cookies are `Secure`, `HttpOnly`.
- At rest: Postgres volumes and S3 objects are encrypted by the providers' server-side encryption. [Founder: name the S3 encryption mode in force — SSE-S3 or SSE-KMS — after checking the bucket.]
- Passwords are bcrypt (cost 12). Invitation, share-link and reset tokens are stored only as SHA-256 hashes; the raw token exists in the email or URL alone.

## Isolation between organisations

- Every tenant table carries a PostgreSQL row-level-security policy on `tenantId`; application queries run as a database role that cannot see another tenant's rows, and a forged cross-tenant write is refused by the database itself (`docs/security/rls_implementation.md`; proven by the RLS integration suites in `packages/database/tests`).
- An office or clinic is one tenant. Members hold a seat with a role (owner, attorney, investigator, viewer); the read-only viewer cannot open a matter. A removed seat is refused on the very next request, not the next sign-in.
- A packet a family consents to share with a clinic is delivered as a reference into the clinic's own inbox — nothing is copied or re-uploaded — and every open re-checks that the consent is still live. Revoked consent closes the packet.
- Staff access is role-gated and every staff write is audit-logged with who, what and before/after.

## Malware and input handling

- Every upload is scanned by ClamAV before it reaches OCR; an infected file is quarantined and never processed.
- Records are processed per page; nothing in a record is executed.

## Retention and deletion

| Data | Kept |
|---|---|
| Case content (record, pages, findings, report) and identity | 12 months after delivery, or on a verified request |
| Disclosure acknowledgements (what was shown, when; no case content) | 24 months |
| Payment ledger (amounts, Stripe ids) | 7 years |
| Event and audit skeleton (PII-minimal) | 24 months, then aggregates |
| Backups | 35-day expiry |

Deletion is scoped, not monolithic: case content is hard-deleted (database rows and S3 objects), a deletion certificate is written into the surviving event stream, and the retention rows above are all that remain (`apps/api/src/services/deletion.service.ts`). Storage moves to a cooler tier after 90 days and is deleted at 12 months (`data_retention_tiering.md`).

## Sub-processors

| Provider | Purpose | Data it sees |
|---|---|---|
| Render | Application hosting, Postgres, Redis | Everything the application holds |
| Amazon Web Services | S3 document storage, Textract OCR | Uploaded records and extracted pages |
| Anthropic | The analysis model | Record text sent per screen for analysis [Founder: state the retention terms of the API agreement in force] |
| Stripe | Payments and invoices | Billing name, email, amounts; no record content |
| Resend | Transactional email | Recipient address and the email body (links, status; no record content) |
| Sentry | Error tracking | Stack traces and request metadata; PII scrubbed |
| PostHog | Product analytics | Pseudonymous funnel events; no record content |

The list is maintained in `docs/operations/external_services.md`; a change is announced to organisation owners by email before it takes effect. [Founder: confirm the notice period for the DPA.]

## Account security

- Password rules: 12+ characters with an uppercase letter and a number or symbol; sign-in is rate-limited; resets and invitations expire.
- Organisation owners invite colleagues by email; invitations expire in 7 days and are single-use. [Founder: SSO / MFA are not offered in January; say so.]

## Incident response

Security issues go to the organisation's named security contact at Snot Nose Legal, [security@snotnoselegal.com — founder to confirm the mailbox]. We notify affected organisations without undue delay after confirming an incident that touches their data, and we keep the audit trail that lets us say exactly what was touched.

---

*Not a law firm; not legal advice. This page describes controls as built; the DPA governs.*
