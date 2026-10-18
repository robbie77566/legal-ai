# Staff Console — roles, money, case files, requests, invites (as built, 2026-09-08)

**Status:** shipped on `main` (this document describes what the code does). The full product rationale — jobs to be done, the permission matrix, the Team-page and MFA plan that is *not* built yet — lives in the two design artifacts:
- Staff Console Access Model (spec): https://claude.ai/code/artifact/9cd5b644-1710-49be-bea0-76b228fc73f1
- Payments and Refunds (spec): https://claude.ai/code/artifact/57e38407-f10f-40a9-acf6-a1c22d273269
- Staff Console design canvas (mockups): https://claude.ai/code/artifact/1607f2e2-adfe-476c-8679-9891a6df2d1c

## 1. Roles

| Role | Who | Lands on | Sees in the `/ops` nav |
|---|---|---|---|
| `ADMIN` | founder / ops | `/ops` | Overview · Holds · Cases · Accounts · Promos · Money · Feedback · Retention · Team |
| `SUPPORT` | customer-facing staff (new) | `/ops` | Overview · Cases · Accounts · Feedback |
| `ATTORNEY` | quality reviewer | `/qa` | (no `/ops` access) |
| `CLIENT` | the family | `/cases` | never reaches `/ops` |

Admin is a superset of Support by construction. The web nav is UX gating only (`apps/web/app/ops/layout.tsx`, `apps/web/middleware.ts`); the API hook in `apps/api/src/routes/ops.ts` is the real gate:

- `ADMIN`: everything under `/ops`.
- `SUPPORT`: every `GET` except `/ops/payments*`, `/ops/refunds`, `/ops/promos`, `/ops/retention-candidates`, `/ops/sentry-test`, `…/cogs`; and exactly these `POST`s on a case: `delay-ours`, `delay-cleared`, `resume`, `contact`, `requests`. Everything else is 403 with a sentence saying who can.

## 2. Pages

| Route | Purpose | Roles |
|---|---|---|
| `/ops` | Overview: "Needs you now" (holds, stalls, retention, **Approvals** for admins / **Waiting on an admin** for support), health tiles (admin), case table + drawer | Admin, Support |
| `/ops/cases` | Every case, searchable, in the family's stage wording, linking to its case file | Admin, Support |
| `/ops/cases/:id` | **Case file**: uploads (page counts, OCR confidence, quarantine, signed download), analysis (screens done, findings as the family reads them, Part B folded), what the family received (every report version as PDF, share link opens), **contact log**, requests, timeline; actions: mark/clear delay, resume pipeline; Admin: Refund door + decide requests; Support: Request refund / Request deletion | Admin, Support |
| `/ops/money` | Payments audit: six tiles (collected, refunded, net, refund rate vs 5% reserve, cost of reviews, needs a decision), weekly rollup (cohort view: refunds attributed to the week the payment was sold), open disputes + support requests, refund ledger, full payments table with Stripe deep-links, **refund dialog** (full or partial, reason, note), reconcile-now | Admin |
| `/dashboard/permissions` | Create staff accounts (sends the invite), change roles, resend invites | Admin (linked as **Team** in the nav) |
| `/auth/setup-password` | Invite acceptance — the first password for an admin-created account | public, token-verified |

## 3. Money and refunds (OPS-2)

- `Refund` table: one row per refund actually issued (partial refunds stack); `Payment` gains `paymentIntentId`, `chargeId`, `refundedCents`, `refundedAt`, `disputedAt`, `disputeStatus`, status `PARTIALLY_REFUNDED`. Migration `20260907000016_refund_ledger`.
- `apps/api/src/services/refunds.service.ts` — `issueRefund` (Stripe with an idempotency key → one tenant transaction: Refund row, rollup + status, `payment.refunded` v2 event, `REFUND` audit row); over-refund / free-purchase / open-dispute walls; webhook handlers match `charge.refunded` and `charge.dispute.*` by payment intent (the old matcher compared a payment-intent id to a checkout-session id and updated nothing in production).
- Routes: `GET /ops/payments`, `GET /ops/payments/summary?days=`, `GET /ops/refunds`, `POST /ops/payments/:id/refund`; `POST /ops/cases/:id/refund` kept as a wrapper.
- Numbers: **collected** = charges on payments created in the period; **refunded** = refunds on those *same* payments whenever issued (cohort); **refund rate** = refunded ÷ collected; **net** is before Stripe fees (not synced).

## 4. Case file and Support (OPS-6)

- `apps/api/src/services/case-file.service.ts` — `getCaseFile` (owner connection; staff hold no `CaseAccess`), `staffDocumentDownloadUrl` (same 5-minute presign as the customer route, never for quarantined files), `staffReportPdf` (re-renders any released version with FR-7 re-verification). Downloads are audited under the staff member.
- **Contact log**: `SupportNote` rows (channel, body, author) + a `support.contacted` event carrying only `{noteId, channel}` — free text never enters the PII-minimal event stream. `POST /ops/cases/:id/contact`.
- Migration `20260907000017_support_role` adds the enum value.

## 5. Requests to an Admin

- `StaffRequest` (`REFUND` | `CASE_DELETE` | `ACCOUNT_DELETE`; reason from a fixed list; optional note and partial amount). One *open* request per case + type (partial unique index). Migration `20260908000018_support_notes_requests`.
- `apps/api/src/services/staff-requests.service.ts`: `openRequest` (refuses refund requests with no refundable payment; emails every Admin once), `listRequests` (Support sees only their own), `decideRequest` (approve runs `issueRefund` / `deleteCaseScoped` / `deleteAccount` under the **Admin's** id; decline requires a note; both write `request.decided` + audit).
- Routes: `POST /ops/cases/:id/requests` (Support/Admin), `GET /ops/requests`, `POST /ops/requests/:id/decide` (Admin only — the hook keeps Support off it).
- Surfaces: case file (both roles; Admin decides inline), Overview (Admin: Approval cards; Support: Waiting on an admin), Money → Needs a decision.

## 6. Invites (auth design §4.6)

- `POST /permissions/users` now issues a hashed 24-hour `inviteToken` and sends `sendInvite` (who added you, as what, the two steps, what you will see). Returns `invite.setupUrl` **only when the email could not be delivered** so the admin can hand it over.
- `POST /permissions/users/:id/invite` resends (rotates the token); 409 once a password exists (use Forgot password).
- `POST /auth/setup` (public prefix, token-verified, rate-limited) sets the first password; single-use. The web page `/auth/setup-password` then sends the person to `/auth/signin?welcome=1&email=…`.
- `GET /permissions/users` exposes `active`, `invitePending`, `inviteExpired` for the team list.

## 7. Events added

`payment.refunded` v2 (`refundId`, `amountCents`, `partial`) · `support.contacted` · `request.opened` · `request.decided`. Registry: `packages/case-lifecycle/events.ts`.

## 8. Tests

`apps/api/tests/money.integration.test.ts` (refund path against a Stripe double, webhooks, requests decided by an admin), `support.integration.test.ts` (role walls, case file, downloads, PDF, notes, requests raised), `invite.integration.test.ts` (invite email, setup, rotation, undeliverable fallback); web: `MoneyPage`, `CaseFile`, `CasesPage`, `OpsDashboard` (role-filtered nav, approvals, waiting-on-admin).

## 9. Not built (see the access model)

Roles as a *set* per person on the gates (the rows exist, see §10; `/ops` and `/qa` still read `role`); DB-authoritative role checks (today a role change takes effect at next sign-in); the `/ops/team` page with deactivate / last-admin guard / MFA; `/qa` under the console shell; audit-action enum; CSV export; Stripe fee sync.

## 10. Organisations and account kinds (added 2026-10-19)

The identity **expand** step of the persona rollout (`docs/implementation/persona_rollout_plan.md` §5 A, §7 "Deploy discipline"). Migration `20261019000029_organisations`; everything is additive and the `Role` column and every gate that reads it keep working unchanged.

**The model.**

| Table / column | What it is |
|---|---|
| `User.accountKind` — `FAMILY` \| `PROFESSIONAL` \| `STAFF` (default `FAMILY`) | *Who* a person is: which surface they belong to. Backfilled by the migration: `CLIENT` → `FAMILY`; `ADMIN`, `SUPPORT`, `ATTORNEY`, `INVESTIGATOR`, `VIEWER` → `STAFF` (every non-CLIENT role is staff per §1). |
| `StaffGrant { userId, kind: ADMIN \| SUPPORT \| REVIEWER, grantedBy, grantedAt, revokedAt? }`, unique per user + kind | *What a staff member may do*, as a set. Backfilled `ADMIN`→`ADMIN`, `SUPPORT`→`SUPPORT`, `ATTORNEY`→`REVIEWER`; `INVESTIGATOR`/`VIEWER` get no grant (no console surface). Revocation is a timestamp, never a delete. `POST /permissions/users` creates the matching grant; `PATCH /permissions/users/:id` revokes the old one and grants the new. |
| `Organisation { tenantId @unique, kind: FIRM \| PD_OFFICE \| CLINIC \| FAMILY, name, legalName?, billingEmail?, pilot, pilotEndsAt?, allowanceRecords, allowanceResetsAt?, features, isTest }` | The 1:1 profile of a Tenant, so RLS stays tenant-scoped and every existing tenant table is already the organisation's data. Pilot flag, allowance and `features` are read by the price book (B) and flags (J); `isTest` organisations are excluded from Money and analytics. Family tenants have no row yet (nothing reads one). |
| `Membership { organisationId, tenantId, userId, role: OWNER \| ATTORNEY \| INVESTIGATOR \| VIEWER, invitedBy? }`, unique per organisation + user | A person's seat. `tenantId` is denormalised so the RLS policy is the same plain column test as the other tenant tables. |
| `User.barNumber?, barState? ('TX'), barVerifiedAt?, barVerifiedBy?, practiceType?` (`writ`, `appellate`, `trial`, `pd`, `clinic`, `investigator`, `other`) | The professional profile. The bar number is stored **unverified** at sign-up; the staff verification queue is workstream G. |

RLS: `Organisation` and `Membership` carry `tenant_isolation_policy_*` (USING + WITH CHECK on `tenantId`), ENABLE without FORCE like every other table since `20260901000012`. `StaffGrant` is a system table read on the owner connection. Proven by `packages/database/tests/organisations-rls.integration.test.ts`.

**Professional accounts keep `role: CLIENT`.** Every existing staff gate (`/ops`, `/qa`, `/admin`, `/dashboard`, `/workspace`) refuses `CLIENT`, so a professional can never reach a staff surface through the legacy column; `Role.ATTORNEY` stays what §1 says it is, the staff reviewer. The api auth plugin additionally refuses a `PROFESSIONAL` on `/ops`, `/qa`, `/admin` and `/permissions` whatever the role column says, and the web middleware does the same for `/ops`, `/qa`, `/dashboard`, `/workspace` (`apps/web/lib/route-access.ts`).

**Reading the two shapes at once.** `packages/database/staff.ts`:
- `effectiveAccountKind(user)` — the stored kind, except a row still at the `FAMILY` default with a staff role counts as `STAFF` (a staff account created by a pre-expand code path, the same answer the backfill gives).
- `effectiveStaffGrants(user)` — the active grant rows when the person has any rows (revoked ones included), else the one grant the role implies. A non-STAFF account never holds a grant.
- `hasGrant(grants, kind)` — ADMIN is a superset of SUPPORT by construction.

**Per request, from the database.** The api auth plugin (`apps/api/src/plugins/auth.ts`) puts `accountKind` and `grants` on `request.auth` from the database on every request (the session token format is unchanged); `requireAccountKind(...)` and `requireGrant(...)` in `apps/api/src/plugins/guards.ts` read them. `/counsel/*` uses `requireAccountKind('PROFESSIONAL')` plus a per-request membership load, so a removed seat or a revoked grant is a 403 on the very next call, not the next sign-in. The web session carries `accountKind` beside `role` (refreshed from the database on every JWT refresh); `/go` lands a professional on `/counsel` (`apps/web/lib/landing.ts`).

**Routes.** `POST /counsel/signup` (public, rate-limited, bcrypt cost 12, enumeration-safe like `/buy/account`: a duplicate email answers `{ ok: true }` with no ids): creates Tenant + Organisation + User (`PROFESSIONAL`, role `CLIENT`) + `OWNER` membership in one transaction and writes an `ACCOUNT_SIGNUP` audit row (never the bar number). `GET /counsel/me`: the user, their organisation (kind, name, pilot, allowance), their membership role, bar fields and `barVerified`.

**Expand → swap → contract.** This step is the expand. Swap (later, any agent): `/ops` and `/qa` adopt `requireGrant`, `/permissions` and the Team page write grants as the source of truth, the `Role.ATTORNEY` reviewer becomes `REVIEWER`. Contract (founder-run migration): drop `Role` and the `accountKind` default, after the matrix tests in `apps/api/tests/organisations.integration.test.ts` and `apps/web/tests/unit/RouteAccess.test.ts` pass against the swapped gates. No new environment variables at any step.
