# Moving between dev and production

**Purpose (2026-09-11).** Every production failure in September was configuration, not code: dropped secrets after blueprint syncs, a revoked API key, a shared S3 bucket, and one code path (the malware scan) that dev never ran. This page makes production inspectable from the dev box in seconds, makes dev run the same code paths, and puts a drift check in CI so the next difference is caught before a customer finds it.

The rule underneath everything: **the running dev app never points at production.** Inspection scripts open their own read-only connection with an explicit `--env`; `.env` stays dev.

## 1. Make dev run what production runs (one-time, ~5 min)

| Production path | Dev today | Do this |
|---|---|---|
| Every upload is malware-scanned by clamd; an unreachable scanner **rejects** (digitizing fails 3×, document stays unread) | No scan | `docker compose --profile scan up -d clamav` (first start downloads ~300 MB of signatures, a few minutes), then in `.env`: `CLAMD_HOST="localhost"` |
| Node heap capped at 1536 MB; 2 documents digitize at once, 2 analyses | Unbounded, 2/2 | `.env`: `NODE_OPTIONS="--max-old-space-size=1536"`, `INGESTION_CONCURRENCY=2`, `ANALYSIS_CONCURRENCY=2`, `ZIP_CONCURRENCY=1` |
| Batch analysis with the 400k-token live fallback | Already `ANALYSIS_BATCH=1` | nothing |
| Auto-approve | `AUTO_APPROVE=1` in dev | match production's value while testing that behaviour |

Then `pnpm env:drift` — the "prod-only code paths NOT exercised in dev" line should be gone.

## 2. Inspect production from the dev box (one-time setup, then seconds)

### a. Read-only database role (once, ~2 min)
1. Render → hg-postgres → **Shell**. Paste `docs/operations/sql/readonly_role.sql` with a password from `openssl rand -base64 24 | tr -dc 'A-Za-z0-9'`.
2. Render → hg-postgres → Info → **External Connection String**; replace the user and password with `hg_readonly`'s; keep `?sslmode=require`.
3. `cp .env.prod.example .env.prod` and set `PROD_DATABASE_URL` to that URL. `.env.prod` is gitignored; nothing in the app reads it.
4. The dev box's public IP must be in hg-postgres → **Access Control** (it already is for the founder's box; a new laptop needs adding).

### b. Look at a case or an account
```bash
pnpm prod:case robbiecbruce@gmail.com          # production, read-only
pnpm prod:case <caseId> --events 100           # more timeline
pnpm prod:case <email> --env dev               # the same view of the local database
```
Prints the account, each case with status and dates, every document and whether it was READ or NOT READ YET, analysis runs with checks finished and findings, payments, and the newest events. The script refuses a production URL whose user is not `hg_readonly`.

### c. What the database cannot show — and where it is
| Question | Where |
|---|---|
| Is a job alive right now? Why did it die? | `/ops/cases/<id>` pipeline card (live job state + failure reason); `/ops/diagnostics` failed-jobs list |
| Do the api's credentials work? (Anthropic key, S3, Textract, clamd, Redis) | `/ops/diagnostics` — live probes with the api's own credentials |
| Which env values does the api process see? Which secrets are present? | `/ops/diagnostics` |
| Stack trace of something that threw | Sentry (DSN is in the blueprint; the alert drill on `/ops` proves capture) |
| Raw logs / a shell on the api | Render CLI (below) |

### d. Render CLI (logs and a shell from the terminal)
```bash
brew install render   # or: npm i -g @render/cli  — see render.com/docs/cli
render login
render services                       # find the api service id (api-4t7h)
render logs -r <api-service-id> --tail
render ssh <api-service-id>           # a shell IN the api: node scripts/purge-dev-prefixes-from-prod.cjs, etc.
```
The shell runs with the api's real environment, so anything that needs the production AWS or Anthropic key runs there, never on the dev box.

## 3. Catch drift before it bites (automatic)

`scripts/env-drift.cjs` runs in **CI** and in the **gate**: every variable `render.yaml` declares must be documented in `environment_reference.md`, and every non-secret api value must appear in `.env.example`. Locally, `pnpm env:drift` adds what this box is missing versus the blueprint, which production-only code paths dev is not exercising, whether `.env` points at the production bucket (fails), and whether `.env.prod` is present.

What it cannot see is a value that is *set but wrong* on Render (a revoked key, a mismatched secret between web and api). That is what `/ops/diagnostics` is for — check it after every blueprint change, because a sync is exactly the event that has dropped values before.

### 3b. Orphaned Render resources (the abandoned-Postgres problem)

**What happened.** The first deploy (2026-08-31) created a Postgres, a Key Value store and a clamav under earlier names. The blueprint was then edited (`hg-postgres`, `hg-redis`, `clamav`) and re-applied. Render created the new resources and **left the old ones running** — Render never deletes a resource that drops out of a blueprint, it only stops managing it. The strays cost ~$50/month, and the stray Postgres had its allowlist open to `0.0.0.0/0`. Found ten days later, by accident, when the CLI listed services.

**Rules.**
1. **Never rename a resource in `render.yaml` once it exists.** A rename is a create-plus-orphan. If a rename is unavoidable, delete the old resource the same day.
2. **After every blueprint change, run `pnpm render:inventory`.** It lists every resource in the workspace, marks each `in blueprint` / `render add-on` / `ORPHAN`, flags a Postgres open to the internet, and exits 1 on orphans. (Needs `render login` or `RENDER_API_KEY`; it is not in CI because CI has no Render credential — it is a human step on the same checklist as the Diagnostics check.)
3. **Before deleting a stray Postgres**, confirm it is empty: `scripts/prod-case.cjs` will not help (different database); the inventory script tells you which one to check and the dashboard's pgAdmin shows its tables. Deletion is done in the dashboard; it is deliberately not scripted.

## 4. Safety rules
- Production credentials on the dev box are **read-only** (`hg_readonly`) or **absent** (the AWS key here is dev-scoped; `node scripts/aws-scope-check.cjs dev` proves it).
- Anything that writes to production runs **in** production: the Render shell, or the ops console.
- A key that appears in a chat transcript is rotated (readiness §5). Anthropic disables exposed keys on its own — the "API key is invalid" of 2026-09-10 was that.
