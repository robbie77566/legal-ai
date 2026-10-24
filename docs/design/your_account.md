# Your account — the family's signed-in home

**Status:** shipped 2026-09-09 (built 2026-09-08, reviewed and merged 09-09). Route `/account`; API `/me`.

## Why

A family had reviews (`/cases`) but no account: nothing showed what they had paid, what they had shared, what emails to expect, or how to change their name, email, or password. Support requests for those things had nowhere to point. The old "Your reviews" list became one section of a single account landing.

## What a family sees (`/account`)

| Section | Content | Source |
|---|---|---|
| Greeting | "Hello, {first name}." Signed in as {email}. | `GET /me` |
| Your reviews | One card per review, newest first and highlighted: title (county · year), stage in the family's words, facts line, documents/pages counts, report versions, one stage-appropriate primary action. "Start another review" below. | `GET /me` `reviews[]` |
| Account & settings | Name (inline edit), email (change with confirmation, see below), password (change, signs out other devices). | `PATCH /me`, `POST /me/email`, `POST /me/password` |
| Payments | Every payment with kind, amount, card brand + last four, receipt link; refunds with partial/full; free (promo) purchases say so. | `GET /me` `payments[]`, `refunds[]` — card details fetched from Stripe once and kept on the row (brand and last4 only) |
| Sharing | Attorney packet link state (created, expires, opens); clinic consent. | `GET /me` |
| The emails we send | The list, so a missing one is noticed. | static |
| Your data | Download everything uploaded (one zip); request deletion. Disclosure acknowledgments with versions. | `GET /me/export`, `POST /me/delete-request` |

Signed-in indicator everywhere on the family side: **FamilyNav** — the name is the signal and the door (phone: link to `/account`; desktop: a menu naming each review, settings, sign out). On brand pages the **NamePill** in SiteNav does the same; staff go through `/go` instead. `/cases` and `/go` (for CLIENT) now land on `/account`.

## Email change (U5)

1. Family enters the new address and their current password.
2. The new address is stored as `pendingEmail` with a hashed token (24 h). A confirmation email goes to the **new** address; a notice goes to the **old** one ("nothing changes until that address confirms; if this wasn't you, change your password").
3. Sign-in keeps using the old address until the link at `/account/confirm-email` is opened (public route, token-verified, rate-limited 10/15 min). Then `email` flips and the pending fields clear.
4. The family can cancel a pending change from the account page.

A second account already using the new address is refused at both steps.

## Deletion is a request (U8)

The family never deletes directly. `POST /me/delete-request` opens an `ACCOUNT_DELETE` staff request that an Admin decides on the ops Overview; the family sees "Deletion requested {date} — we'll confirm by email." Refused while any review is mid-pipeline (finish or refund first). Idempotent. Needs at least one review to hang the request on; with none, the page tells them to contact us.

## Export

`GET /me/export` streams one zip of every non-quarantined upload, foldered by review, audited (`account_export`). Refused above 50 files **or 300 MB total** (sizes read from S3 before bundling — the zip is built in memory). Larger records download per review.

## Review notes (2026-09-09, before merge)

- Added the 300 MB byte cap on export (file count alone did not bound memory).
- Zero-review accounts get a clear message on deletion instead of "could not record".
- Staff on the brand site: the name pill goes to `/go`, not the family page.
- Removed an unused import. Tests: `me.integration.test.ts` (8), `YourReviews.test.tsx` (4), `FamilyNav.test.tsx` (3), `SiteNavSession.test.tsx` (2), plus an export-cap test.

## Not done

Phone number and first/last for families (staff have them at `/ops/profile`); changing a staff email (admin, Team page); a per-review download when the account export is too large (the documents page lists files individually today).

## Backup email (2026-10-24)

A second address on the account, verified from a link sent to it, then used for account recovery and security notices. Staff first (`/ops/profile`, "Backup email" card under the email field); the same card sits in the family account's settings in the Daybreak voice, `{en, es}` (`apps/web/lib/content/backup-email.ts`).

| | |
|---|---|
| Schema | `User.backupEmail`, `backupEmailVerifiedAt`, `backupEmailToken` (sha256 of the raw link token), `backupEmailExpires`. No uniqueness — two accounts may name the same recovery address — but a backup may never equal the account's own `email` or another account's `email` (case-insensitive). Migration `20261024000040_backup_email`. |
| Add | `POST /me/backup-email { email }` (10/15 min): stored unverified with a 24-hour token; the confirmation goes to the **new** address (`/auth/backup-email/confirm?token=…`), a notice to the primary ("a backup email was added; if this wasn't you, change your password"). Re-posting replaces a pending (or verified) address and re-issues the link. The account's own address is refused in plain words; another account's sign-in address is refused with the neutral *"That address can't be used as a backup here"* — nothing about other accounts leaks. |
| Confirm | `POST /me/backup-email/confirm { token }` — public, token looked up by hash and checked timing-safely, single-use. Sets `backupEmailVerifiedAt`, clears the token; both addresses are told. The confirm page is shared by staff and families and links to sign in. |
| Remove | `DELETE /me/backup-email` clears all four fields; both addresses are told. |
| Read | `GET /me` returns `backupEmail`, `backupEmailVerified`, `backupEmailVerifiedAt`, `backupEmailAddedAt` (while pending) — never the token. |
| Recovery | `POST /auth/forgot` also matches a **verified** backup (case-insensitive): the reset link goes to the backup, the primary gets "a password reset was requested from your backup email". An unverified backup never matches (indistinguishable from an unknown address). When one backup address stands on several accounts, each gets its own link. |
| Notices | Password changes (`POST /me/password`, `POST /auth/reset`) and a primary-email change request tell the verified backup as well as the primary. Addresses in notice bodies are masked (`r•••@example.com`). If a pending primary-email change confirms to the address that was the backup, the backup fields clear (the two addresses are never the same one). |
| Audit | `ACCOUNT_SECURITY` rows with `op: backup_email_add | backup_email_verify | backup_email_remove` — ids only, never an address. |
| Seed | `ADMIN_BACKUP_EMAIL` (optional, seed-only) stores a verified backup on the admin account; the seed logs "backup email set" without the address (`environment_reference.md` → Bootstrap). |

Tests: `backup-email.integration.test.ts` (13), `auth-recovery.integration.test.ts` (+3), `OpsProfileBackupEmail.test.tsx` (4), `AccountBackupEmail.test.tsx` (6, with the `{en, es}` parity check), `BackupEmailConfirmPage.test.tsx` (4), `seed-admin.integration.test.ts` (3).
