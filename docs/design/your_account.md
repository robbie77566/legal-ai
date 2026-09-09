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
