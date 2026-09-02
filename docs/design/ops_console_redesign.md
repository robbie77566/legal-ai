# Ops Console Redesign — Jobs to Be Done

**Prepared:** 2026-09-02 · **Reviewer roles:** UX (JTBD) then engineering · **Operator:** one founder, checking in a few times a day, often from a phone between other work.

## 1. Jobs to be done (what the operator actually opens `/ops` to do)

| # | Job | Frequency | Today |
|---|---|---|---|
| J1 | **"Is anything on fire?"** — a QA hold nearing its 24h promise, a stalled case, a customer waiting on us | every visit | Holds lived on a **dead link** (`/qa/holds` — no such page); stalls were a chip inside a table you had to scan |
| J2 | **"Is the system healthy / configured?"** — email actually sending, Stripe in test vs live, auto-approve on, scanner armed | after every deploy/env change | **Nowhere.** Two silent failures today (Resend key not loading, web missing `DATABASE_URL`) each cost an hour because nothing surfaced them |
| J3 | **"Where is case X and what happened to it?"** | daily | Queue → timeline works, but actions (delay/refund/delete) are an undifferentiated row of small buttons; delete uses a browser `confirm()` |
| J4 | **Deal with a customer:** find their account, see their cases, delete on request | weekly | Accounts page (fixed today to list by default) |
| J5 | **Money & growth:** promo codes, per-case COGS, feedback signal | weekly | Promos page exists; COGS and feedback endpoints have **no UI at all** |
| J6 | **Housekeeping:** retention candidates past 12 months, restore drills, alert drill | monthly | Retention endpoint has no UI; Sentry drill button sits in the header of every visit |

## 2. Findings

- **F1 — No triage layer.** The console opens on a raw queue table. The single most important question (J1) required scanning chips or clicking a broken link. → Dashboard opens with **"Needs you now"**: held cases with their SLA countdown and a one-click re-run, stalled cases, and retention candidates — empty-state says so explicitly.
- **F2 — No system-health surface (J2).** → **Health tiles** from a new `GET /ops/status`: email transport (Resend configured + from address, or *logging only*), Stripe mode (test/live/unset), auto-approve on/off, malware scanner armed, Sentry/PostHog wired, plus live pipeline counts (awaiting docs / digitizing / analyzing / held / ready). Red states say what to fix.
- **F3 — Dead and scattered navigation.** Links differed per page, one was a 404, and the drill button masqueraded as navigation. → One **`OpsShell`** with a persistent nav (Overview · Holds · Accounts · Promos · Feedback · Retention) on every ops page; the drill moves under Health as a labeled utility.
- **F4 — Destructive actions undifferentiated.** Delay / archive / refund / delete were the same visual weight; delete confirmed via `window.confirm`. → Case drawer groups **routine** (delay, archive) from **irreversible** (refund, delete), and delete uses the same **type-the-title confirmation** as account deletion. COGS for the case is shown in the drawer (J5) — one number, not a hidden endpoint.
- **F5 — Existing data with no door.** Holds, feedback, retention. → Dedicated pages, each a table with the one action that job needs (re-run / read / delete).
- **F6 — Timeline unreadable.** `MM-DD HH:MM type actor` in mono. → Grouped newest-first with human dates and the event type de-snaked.

## 3. Engineering review of the design

- **One status endpoint, not six.** `/ops/status` computes cheap counts (`groupBy` on case status) and reads env presence — no secrets echoed (only *configured / not*, and the Stripe key *prefix* to derive test vs live). Cacheable per request; no new tables.
- **Reuse the proven action paths.** Holds page calls the existing `/qa/holds` + `/qa/cases/:id/rerun`; retention calls `/ops/retention-candidates` + `/ops/cases/:id/delete`; nothing new on the destructive side.
- **Shell as a layout, not a component prop.** `apps/web/app/ops/layout.tsx` wraps every `/ops/*` page — the nav can't drift again.
- **Empty states are assertions.** "No holds — nothing is waiting on you" is rendered text, so the test suite can prove the triage layer answers J1 even when idle.
- **Kept out:** charts (five numbers beat a chart at this volume), real-time SSE on the dashboard (a reload is fine at a few visits a day), role changes for staff (not a current job).

## 4. Verification

Unit tests: dashboard renders health tiles from a stubbed `/ops/status` (including the red "logging only" email state and "live"/"test" Stripe mode), "needs you now" shows holds with countdown + stalled cases, empty state text, nav present on every page; case drawer groups actions and delete requires the typed title. Integration test: `GET /ops/status` shape + admin gate. Live: the deployed `/ops` renders the tiles against production's real env — which is the whole point.
