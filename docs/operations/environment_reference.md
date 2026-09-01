# Environment Variable Reference

**Updated:** 2026-09-01 · Every variable the code reads, where its value comes from (exact path), and which process needs it. Generated from a code sweep, not memory. Secrets are marked 🔑 (belong in Render's env store / local `.env` only — never in git).

## Where env files live (dev)

| File | Read by | Contents |
|---|---|---|
| `/.env` (repo root) | API (dotenv walk-up), scripts | Everything below except web-only |
| `apps/web/.env.local` | Next.js web | `NEXTAUTH_SECRET` (same value as root!), `NEXTAUTH_URL`, `NEXT_PUBLIC_*` — **Next.js cannot see the root `.env`**; missing this file = sign-in fails with `error=Configuration`/`NO_SECRET` |
| `packages/database/.env` | Prisma CLI | **ONLY** `DATABASE_URL` — Prisma auto-loads this file first and first-set wins, so anything else here shadows the root |

In production (Render) there are no files: every value is a service env var (blueprint `render.yaml` wires the non-secrets; `sync: false` entries are pasted in the dashboard).

## Core — API service

| Var | 🔑 | Purpose | Where to get it |
|---|---|---|---|
| `DATABASE_URL` | 🔑 | Owner Postgres connection (migrations, system surfaces) | Dev: compose default. Prod: auto-wired `fromDatabase` in the blueprint; visible at hg-postgres → Info → Internal Connection String |
| `HG_APP_PASSWORD` | 🔑 | Password for the `hg_app` RLS role (`withTenant` derives the app connection from `DATABASE_URL` + this) | You generate (`openssl rand -base64 24`); must equal the password used in the `CREATE ROLE hg_app` SQL |
| `APP_DATABASE_URL` | 🔑 | Optional full override for the hg_app connection | Only if the derived URL is wrong (rare) |
| `REDIS_URL` | 🔑 | BullMQ, SSE pub/sub, rate limiting | Dev: `redis://localhost:6379`. Prod: auto-wired `fromService`; hg-redis → Info |
| `NEXTAUTH_SECRET` | 🔑 | Session-token signing — **identical value on api AND web** or every API call 401s after sign-in | You generate: `openssl rand -base64 32` |
| `PORT` | | HTTP port (default 3001) | Render injects it; never set manually there |
| `NODE_ENV` | | `production` enables prod guards (seed refusal etc.) | Blueprint sets it |
| `WEB_ORIGIN` | | Comma-separated, dual purpose: CORS allowlist (all entries) AND Stripe checkout success/cancel redirect origin (FIRST entry) | Prod: `https://www.snotnoselegal.com` (blueprint sets it). Dev: set it with your browsing host first — unset, redirects default to localhost and a LAN-IP test lands on the wrong host after payment (hit live 2026-09-01) |

## AI & document pipeline — API service

| Var | 🔑 | Purpose | Where to get it |
|---|---|---|---|
| `DOC_CLASSIFIER_MODEL` | | Tier-1 document classifier model (checklist filing) | Default `claude-haiku-4-5-20251001`; falls back to regex heuristics on any failure |
| `DOC_CLASSIFIER_USD_FACTOR` | | Price ratio of the classifier model vs the MODEL_USD_* rates, for cost estimates | Default 0.2 (Haiku vs Opus) |
| `ANTHROPIC_API_KEY` | 🔑 | Claude analysis engine | console.anthropic.com → API Keys (rotated for prod — dev key transited chat) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | 🔑 | S3 + Textract | AWS IAM → the least-privilege prod user (S3 rw on the two buckets + Textract Start/Get only) |
| `AWS_REGION` | | Bucket/Textract region | `us-east-2` |
| `S3_BUCKET` | | Case-documents bucket | `snl-case-documents-327600375718` |
| `EVAL_CORPUS_BUCKET` | | Encrypted reference corpus (seed `--corpus`) | `snl-eval-corpus-327600375718` |
| `S3_ENDPOINT` | | Optional S3-compatible endpoint override | Unset in real AWS |
| `CLAMD_HOST` | | Arms the ENG-4 malware scan (`host` or `host:port`, default port 3310); unset = uploads log "NOT scanned" | Dev: `localhost` with `docker compose --profile scan up -d clamav`. Prod: auto-wired `fromService` (clamav) |
| `ANALYSIS_MODEL` | | Engine (default `claude-opus-5`) | choice |
| `ANALYSIS_ENGINES` | | Comma list → multi-engine union (Advanced tier) | choice; default single |
| `ANALYSIS_SAMPLES` | | Self-consistency passes 1–3 (recall-tuned: 2) | choice |
| `ANALYSIS_BATCH` | | `1` = Message Batches (50% price, live fallback) | choice; validated |
| `ANALYSIS_BATCH_BUDGET_MS` | | Batch stage budget before live fallback (default 4h) | choice |
| `ANALYSIS_BATCH_MAX_RECORD_TOKENS` | | Records above this run live-sequential (cache-race economics; default 400k) | measured — see runbook |

## Commerce — API service

| Var | 🔑 | Purpose | Where to get it |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | 🔑 | Payments (`sk_live_…` in prod) | Stripe Dashboard → Developers → API keys (live mode) |
| `STRIPE_WEBHOOK_SECRET` | 🔑 | Verifies webhook signatures (`whsec_…`, per endpoint) | Create the endpoint first (Dashboard → Webhooks → `https://api.<domain>/webhooks/stripe`) → Signing secret → Reveal |
| `STRIPE_AUTOMATIC_TAX` / `STRIPE_TAX_CODE` | | Stripe Tax flag + product tax code (default `txcd_20030000`) | Set per the TX sales-tax determination |
| `PRICE_REVIEW_CENTS` / `PRICE_OVERAGE_CENTS` / `PRICE_RERUN_CENTS` | | Price overrides (defaults 29900/4900/9900) | PO decisions |

## Observability & comms — API service

| Var | 🔑 | Purpose | Where to get it |
|---|---|---|---|
| `SENTRY_DSN` | 🔑* | Error capture (unset = off; *ingest-only, low sensitivity) | Sentry → Settings → Projects → project → **Client Keys (DSN)** |
| `POSTHOG_API_KEY` | | snl.* funnel events (`phc_…` project token; write-only, browser-safe) | PostHog → Settings → **Project token & ID** |
| `POSTHOG_HOST` | | Region host (default `https://us.i.posthog.com`; EU accounts must set `eu.`) | PostHog settings header/URL shows region |
| `RESEND_API_KEY` | 🔑 | All transactional email (unset = console transport, loudly) | resend.com → API Keys (+ SPF/DKIM DNS records) |
| `EMAIL_FROM` | | From header (default `Family Case Review <noreply@snotnoselegal.com>`) | choice; domain must be Resend-verified |
| `MODEL_USD_PER_MTOK_IN/OUT`, `MODEL_CACHE_READ/WRITE_MULT`, `TEXTRACT_USD_PER_1K_PAGES` | | Cost-telemetry estimate rates (tokens are truth, dollars estimates) | Current Anthropic/AWS price sheets |

## Web service (Next.js)

| Var | 🔑 | Purpose | Where to get it |
|---|---|---|---|
| `NEXTAUTH_SECRET` | 🔑 | **Same value as the api's** | see above |
| `NEXTAUTH_URL` | | Canonical site URL | Prod `https://www.snotnoselegal.com`; dev the address you browse (localhost or LAN) |
| `NEXT_PUBLIC_API_URL` | | Where the browser calls the API | Prod `https://api.snotnoselegal.com`; dev `http://localhost:3001` or the LAN address for device testing |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | | Palette A/B + landing events (same `phc_` token as the api's) | as above |

## Bootstrap / seed only (never set on services)

| Var | Purpose |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `SYSTEM_TENANT_NAME` | One-shot admin bootstrap: `DATABASE_URL=<prod> ADMIN_EMAIL=… ADMIN_PASSWORD=… pnpm --filter @hg/database db:seed` |

## Legacy (read by parked code, safe to leave unset)

`GEMINI_API_KEY`, `GOOGLE_GENAI_API_KEY`, `OLLAMA_BASE_URL`, `NEO4J_*` — pre-pivot embedding/graph paths; nothing on the product path reads them.
