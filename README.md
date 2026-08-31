# Family Case Review — Snot Nose Legal

A consumer legal-AI service for **Texas post-conviction** families: a $299 flat-fee, AI-analyzed, human-QA'd review of a criminal court record. Findings are grounded to the record verbatim (hash-anchored, re-verified at every render), passed through an attorney QA gate, and delivered as plain-English Part A + attorney-ready Part B — as a web report and a downloadable PDF.

**Status:** MVP feature-complete; full loop proven end to end on two real reference cases (purchase → Stripe fulfillment → S3/Textract digitization → Claude analysis → QA approval → customer report + PDF). Launch gates tracked in [docs/operations/runbook.md](docs/operations/runbook.md); production readiness plan in [docs/operations/go_live_readiness.md](docs/operations/go_live_readiness.md).

---

## Repository layout

```
apps/
  web/                 Next.js 14 (App Router) — customer surfaces, /qa console, /ops console
  api/                 Fastify 5 — API, BullMQ workers (in-process), transactional outbox
packages/
  database/            Prisma 5 schema + migrations, RLS policies, event-sourcing helpers
  case-lifecycle/      Pure domain: state machine, event registry, checklists, calendar, FR-5 deadline engine
  auth/                Session-token helpers (NextAuth v4 JWT compatible)
  email/               Transactional email (Resend; honest console transport without a key)
  reports/             Customer report PDF renderer (pdfkit)
  tsconfig/            Shared strict TypeScript config
docs/                  Requirements, design, implementation plan (progress ledgers), evaluation, operations
scripts/gate.sh        THE verification gate (typecheck + tests + web build)
```

Language: **TypeScript, strict, everywhere** (shared `@hg/tsconfig`; `pnpm typecheck` covers all workspaces).

## Prerequisites

- Node 20+ (dev box runs 24), **pnpm 11** (`corepack enable`)
- Docker (Postgres + Redis; optional clamav)
- Accounts/keys for full functionality: Anthropic API, AWS (S3 + Textract), Stripe (test), Resend (optional — email logs to console without it)

## Install & first run

```bash
pnpm install

# Infrastructure (Postgres w/ pgvector on :5433, Redis on :6379)
docker compose up -d postgres redis
# Optional malware-scan gate (ENG-4): docker compose --profile scan up -d clamav

# Environment
cp .env.example .env          # fill in keys; see notes below
# packages/database/.env must contain ONLY DATABASE_URL (Prisma auto-loads it first)

# Database: migrations + RLS policies (never `db push` — it skips RLS SQL)
pnpm --filter @hg/database db:migrate:deploy

# Run (two terminals)
pnpm --filter api dev         # Fastify + workers + outbox on :3001 (PORT env overrides)
pnpm --filter web dev         # Next.js on :3000
```

**Seed a working case** (bypasses the paywall — dev only, refuses production):

```bash
pnpm --filter api seed:dev                        # sign-in-able family + funded case
pnpm --filter api seed:dev -- --corpus "Gary"     # + reference volumes from the eval bucket,
                                                  #   queued through the REAL digitization pipeline
```

Dev accounts: customer `family@dev.local` / `DevFamily2026!x` · QA attorney `qa@dev.local` / `DevQA2026!x`.

### Environment notes (.env)

Documented inline in `.env.example`. The ones that change behavior:

| Var | Effect |
|---|---|
| `ANALYSIS_MODEL` / `ANALYSIS_ENGINES` | Engine, or comma list for multi-engine union (findings tagged per engine; cross-engine agreement recorded) |
| `ANALYSIS_SAMPLES` | Self-consistency passes per screen (1–3; 2 = recall-tuned default) |
| `ANALYSIS_BATCH=1` | Message Batches (50% price) with stage-budget live fallback; `ANALYSIS_BATCH_MAX_RECORD_TOKENS` routes huge records to live-sequential (cache economics — measured) |
| `CLAMD_HOST` | Activates the upload malware-scan gate |
| `MODEL_USD_PER_MTOK_*`, `TEXTRACT_USD_PER_1K_PAGES` | Cost-telemetry estimate rates (`/ops/cases/:id/cogs`) |
| `RESEND_API_KEY`, `POSTHOG_API_KEY`, `SENTRY_DSN` | Email / analytics / error reporting — each silently honest-off when unset |

## Testing & the gate

**The rule of this repo: every change set passes the gate before it is committed.**

```bash
./scripts/gate.sh     # typecheck (all workspaces) + full vitest suite + web build
                      # branch on ITS exit code — never pipe it (a pipe eats the failure)
```

- ~190 tests: live-Postgres integration (RLS isolation both directions + superuser-bypass canary, event spine, payments idempotency/replay, analysis pipeline incl. FR-6 grounding and FR-7 tamper detection, QA gates, auth), pure-domain suites (state machine, FR-5 deadline vectors, eval scorer), and web unit tests.
- Integration tests need the compose Postgres/Redis running.
- Single project: `npx vitest run apps/api/tests/<file>` **from the repo root** (running inside a workspace breaks project resolution).

**Quality gates beyond the suite** (see runbook for when to run):

```bash
# Eval harness — run after ANY prompt/model/engine change; exit 1 below 100% recall
pnpm --filter api tsx scripts/eval-run.ts <caseId> docs/evaluation/ledgers/<case>.json

# Re-run a case's analysis (QA-reject → re-enqueue loop)
pnpm --filter api tsx scripts/rerun-analysis.ts <caseId>

# Compare engines on the executeScreen seam (diff written to docs/evaluation/)
pnpm --filter api tsx scripts/compare-models.ts <caseId> [challengerModel]
```

## Build

```bash
pnpm --filter api build     # tsup → apps/api/dist/index.js (workspace deps external;
                            #   runtime needs the monorepo node_modules)
pnpm --filter api start     # node dist/index.js (PORT env, default 3001)
pnpm --filter web build     # next build
pnpm --filter web start     # next start
```

## CI/CD

**CI** (`.github/workflows/ci.yml`, required on `main` and PRs): pgvector + Redis service containers → `pnpm install` → **`migrate deploy`** (never `db push` — push skips every RLS policy) → typecheck → full vitest → **gitleaks** secret scan → `pnpm audit --audit-level critical`. Dependabot is enabled.

**CD**: none yet by design — deployment is the P0 workstream in [go_live_readiness.md](docs/operations/go_live_readiness.md) (production Dockerfiles, `/healthz`, deploy-on-green-main with `migrate deploy` as the release step, one-command rollback). Until that lands, "deploy" means the dev box.

## Deployment (target)

Summarized from the readiness plan — read it before provisioning anything:

- **Single managed PaaS provider**: web + api services (Docker), managed Postgres 16 + pgvector (**PITR retention ≤ 35 days — a §11a.2 compliance bound, not a preference**), managed Redis, clamd sidecar. Fits the ~$150/mo hosting line.
- Secrets live in the provider's store only; the production DB gets the non-superuser `hg_app` role and a one-time live RLS canary check.
- Before any live traffic: rotate the Anthropic/AWS/Stripe keys used during development, fresh `NEXTAUTH_SECRET`, least-privilege prod IAM, SPF/DKIM/DMARC for Resend, alert wiring to a phone, and the cutover smoke test — one real $299 purchase walked through purchase → QA → refund.

## Operations

Day-2 operations, failure modes (all learned live, none hypothetical), and the blocked-on-external launch checklist: **[docs/operations/runbook.md](docs/operations/runbook.md)**.

Key surfaces: `/ops` (queue, timelines, refunds, scoped deletion, retention candidates, per-case COGS) · `/qa` (review queue, edits with reading-level lint, run diff, approve/reject) · customer tracker + report at `/case/<id>`.

## Engineering invariants (do not break these)

1. **Grounding is a hard filter (FR-6):** a finding whose quote doesn't verify against its chunk (whitespace-normalized) is dropped, counted, and never persisted. **FR-7** re-verifies hash anchors at QA approval and at *every* render.
2. **The event spine is append-only** (`CaseEvent`, no FK, denormalized tenant, outbox-published); every state change is an event; the outbox is the only SSE publisher.
3. **RLS is real:** app queries run as non-superuser `hg_app` via `withTenant`; the owner connection is migrations/auth/system only.
4. **Model calls never run inside DB transactions** (screens take minutes; transactions time out in seconds).
5. **Honest failure:** no key → case parks loudly at DOCS_COMPLETE; refusals/parse failures → empty screen for QA, never fake findings; email without a key logs, never pretends.
6. Any new analysis screen id must be added to **both** `SCREENS`/lane in `analysis.service.ts` **and** the `screen.completed` enum in `packages/case-lifecycle/events.ts`.

## Documentation map

- Product/req: `docs/specifications/` · Design: `docs/architecture/`, `docs/design/`
- Plan + progress ledgers (the canonical "what's done"): `docs/implementation/mvp_v1_implementation_plan.md`
- Evaluation: `docs/evaluation/` (model comparisons, attorney-signed eval ledgers)
- Business: `docs/business_case/` (12-month case, expansion model)
- Operations: `docs/operations/` (runbook, go-live readiness)
