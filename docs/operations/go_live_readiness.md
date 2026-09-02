# Go-Live Readiness — DevOps Analysis

**Status:** For execution · **Prepared:** 2026-08-31 · **Audience:** founder/operator
**Scope:** everything between "works on the founder's machine" (true today — full loop proven on real data, ~190 tests, launch gate 1 signed) and "a stranger can pay $299 at 2am and nothing needs a human until QA."
**Constraints honored:** solo operator, ~$150/mo hosting line (business case §8c), 10 cases/day capacity target (NFR-5), §11a.2 deletion bounds, Jan-2027 launch.

---

## 1. Verdict and the honest gap list

The application is launch-shaped; the **operations around it do not exist yet**. Verified current state (not assumed — checked):

| Area | State today |
|---|---|
| Prod build | **DONE (Aug 31):** workspace packages now bundle (`tsup noExternal` — the external-TS crash was real and caught by smoke); `node dist/index.js` boots, `/healthz` proves DB+Redis, SIGTERM drains outbox+workers and exits (the original handler kept the process alive forever); `PORT` env |
| Containers / deploy | **No Dockerfiles, no deploy pipeline** — CI is test-only (typecheck, vitest, `migrate deploy`, gitleaks, `pnpm audit`) |
| Database | Docker-compose Postgres on the dev box; **no backups, no PITR, no managed offering chosen**; RLS + `hg_app` role proven by tests |
| Secrets | One local `.env`; **no production secret store**; several keys were exposed during development and MUST be rotated (see §5) |
| Domain/TLS/email DNS | **Verified live 2026-09-02:** apex serves the GoDaddy Website Builder placeholder (HTTP 200, meta says "law firm offering legal advice" — active UPL exposure, indexed); www resolves to GoDaddy parking IPs and HTTPS FAILS (no cert); api.snotnoselegal.com does not exist; **Resend domain NOT verified** — no resend._domainkey DKIM and no send-subdomain SPF/MX in DNS (root SPF is GoDaddy/M365 `-all`; MX is Microsoft 365 — inbound admin@ mail is separate and fine, Resend records live on their own subdomain and do not conflict) |
| Observability | Sentry (DSN-gated, unset), pino logs to stdout; **no uptime checks, no alert routing, no dashboards** — the SRE-2 "page conditions" in code page nobody |
| Workers | BullMQ workers + outbox run **inside the API process** — fine at launch scale; both are multi-instance-safe (SKIP LOCKED, Redis locks) so this is a scaling choice, not a defect |
| Dead weight | Neo4j runs in compose but **nothing references it** except an orphaned service file — decommission before prod |
| Stripe | Test mode only; live keys, live webhook endpoint + secret, and the TX tax setting are unprovisioned |
| Malware scan | clamd wired + compose `scan` profile; **must be ON in prod** (dev logs "NOT malware-scanned") |

## 2. Recommended architecture (fits the $150/mo line)

**DECISION (2026-08-31): Render.** Full platform evaluation (Render / Railway / Fly / DigitalOcean / AWS / Heroku) against the system's discriminating requirements — persistent workers+SSE, pgvector Postgres with two roles and NATIVE PITR ≤35d (§11a.2), a ~2GB clamd sidecar, solo operator, ~$150/mo. Render wins on native PITR + one-dashboard operations; Railway loses only on PITR (would need Neon = second provider); Fly has a Dallas region but a too-young managed-Postgres story; **AWS is the designated scale-up destination** (S3/Textract data gravity, RDS 35-day PITR, IAM-role auth) when volume justifies real infra — the app is twelve-factor, so that migration stays a planned graduation. Architecture:

- **web**: Next.js service (build `next build`, start `next start`).
- **api**: Node service running `node apps/api/dist/index.js` from a monorepo Docker image (workers + outbox in-process, unchanged).
- **Managed Postgres 16 + pgvector**, smallest HA-less tier, **daily backups + PITR, retention set to ≤35 days** (this is a §11a.2 compliance requirement, not a preference — backups older than 35 days would violate the stated deletion bound).
- **Managed Redis** (BullMQ + rate limit + SSE pub/sub).
- **clamd**: sidecar container from the compose profile.
- Cron: Stripe reconciliation already runs on an in-process interval; add a **provider-level daily "is the interval alive" check** rather than moving it.

Estimated on Render: ~$100–130/mo (web $7–25, api $25, Postgres-with-PITR ~$20+, Redis ~$10, clamd needs a ~2GB instance ~$25 — the hidden line item, uptime/monitoring free tiers). **Not recommended:** single VPS + compose — saves ~$60/mo and costs the founder the two things they can't buy back: managed backups and 3am pages about disks.

**Explicitly decommission:** Neo4j (delete `services/neo4j.ts`, drop from compose) — post-MVP graph work re-adds it deliberately.

## 3. P0 — launch-blocking workstreams (est. 4–6 founder-days total)

| # | Task | Acceptance criterion |
|---|---|---|
| 1 | ~~Dockerfile~~ **superseded by `render.yaml` blueprint (Aug 31):** Render-native Node builds for web+api (build/preDeploy/start commands in the blueprint), clamd as an image-based private service; Dockerfiles deferred to the AWS graduation | Blueprint deploys from the repo root |
| 2 | ~~Runtime smoke~~ **DONE (Aug 31):** `/healthz` (200 only when Postgres AND Redis answer, 503 otherwise), graceful SIGTERM (outbox → workers → HTTP, 15s force-exit), verified live: boot → healthz 200 → SIGTERM → clean exit, port freed | ✅ |
| 3 | **CD pipeline** — via the blueprint: Render auto-deploys on push to main, `preDeployCommand` runs `migrate deploy`, dashboard rollback to any prior deploy; rehearse one rollback after first deploy | A no-op commit reaches prod with zero manual steps; rollback rehearsed once |
| 4 | **Managed Postgres**: create `hg_app` (non-superuser) with `HG_APP_PASSWORD`; owner conn only for migrations; **verify RLS live in prod** by running the superuser-bypass canary test against it once | Canary query proves policies active under `hg_app` |
| 5 | **Secrets in the provider's store** (never files): DATABASE_URL ×2 roles, NEXTAUTH_SECRET (fresh 32+ bytes), ANTHROPIC_API_KEY (rotated — §5), STRIPE live secret + webhook secret, AWS prod IAM pair (scoped — §5), RESEND_API_KEY, SENTRY_DSN, POSTHOG_API_KEY, CLAMD_HOST, cost-rate envs, ANALYSIS_* flags | `.env` on any server contains nothing |
| 6 | **DNS/TLS/email**: snotnoselegal.com → web; api subdomain; provider-managed certs; **apex must 301 → `www`** — `WEB_ORIGIN` is pinned to `https://www.snotnoselegal.com` and Stripe redirects customers there after payment, so a customer who checked out from a live non-redirecting apex would land on a different host (and cookie jar) than the one they signed in on — the exact failure hit in dev testing 2026-09-01 (LAN IP vs localhost). GoDaddy domain forwarding or a Render redirect rule covers it; SPF+DKIM+DMARC for Resend; send a test receipt to a Gmail account and check headers | Apex 301s to www (curl -I confirms); a checkout STARTED from the apex returns signed-in to `/buy/success`; email lands in inbox, not spam; SSL Labs grade A |
| 7 | **Stripe live**: live keys, webhook endpoint + signature secret, Stripe Tax setting per the TX determination, test-clock rehearsal of purchase→refund in live-mode test | A real $299 charge fulfills a case end-to-end; refund flows |
| 8 | **S3/Textract prod IAM**: dedicated IAM user, least-privilege policy (the dev key's policy grew by trial-and-error — write it clean: S3 rw on the two buckets, Textract Start/Get only) | IAM policy simulator passes exactly the needed actions |
| 9 | **Backups/DR**: provider PITR ON, retention ≤35 days; **one restore drill to a scratch instance** before launch; document the §11a.2 deletion-propagation position (PITR window = the propagation bound) | Restore drill produced a working copy; runbook updated with timings |
| 10 | **Alerting** (SRE-2 conditions exist in code; wire them): Sentry alerts → email/phone; uptime check on `/healthz` + the web landing (UptimeRobot free); log-based alerts for: case parked at DOCS_COMPLETE >1h, outbox unpublished backlog >100, webhook signature failures, `[analysis]` batch fallback, COGS/case > $54 | Each alert fired once in a staged test and reached the founder's phone |
| 11 | **clamd ON in prod** + upload of an EICAR test file quarantines | EICAR path proven in prod |
| 12 | **Rate-limit decision**: Redis-down currently fails OPEN (availability over protection). Acceptable at launch — record it as a decision; revisit at scale | Decision recorded in runbook |

## 4. P1 — first two weeks after go-live

- **Staging environment** (same provider, cheapest tiers, Stripe test mode) — today's "test in prod-shaped dev" ends at launch.
- **Load sanity**: replay 10 concurrent seeded cases (the NFR-5 target is 10/day — one afternoon's script proves 10 in an hour).
- **Dashboards**: provider metrics + a single ops page addition: queue depths, outbox lag, cases by stage age (the `/ops` queue already shows most of this — add queue depth).
- **Log retention**: 30 days hot is plenty; pino redaction already strips auth headers — verify no PII leaks in a day-one log audit.
- **Dependency cadence**: Dependabot is on; adopt "merge patch/minor weekly after gate" as routine.
- **Eval-gate cron**: weekly `eval-run` against both reference cases in staging — model-provider drift is real and silent.

## 5. Security actions — before ANY live traffic

1. **Rotate the Anthropic API key** — it transited chat during development. Treat as exposed.
2. **Rotate/retire the dev AWS access key** — replace with the clean-scoped prod IAM user (P0-8); the dev key accumulated broad permissions during Textract debugging.
3. **Fresh Stripe live keys** (test keys also transited chat; live keys must never exist outside the secret store).
4. **Fresh NEXTAUTH_SECRET** for prod; confirm secure/httpOnly/sameSite cookie flags under HTTPS.
5. CORS pinned to the prod origins only (currently pinned to localhost — flip with env).
6. `/ops` and `/qa` stay role-gated (proven by tests); add provider-level 2FA on the hosting, AWS, Stripe, and Anthropic consoles — the founder's accounts ARE the security perimeter of a solo company.
7. Confirm gitleaks + audit CI stay required checks on main.

## 6. Cutover plan (launch day)

1. Freeze main; deploy the release candidate to prod; run P0-2 health checks.
2. Smoke the full loop WITH REAL MONEY once: founder buys a $299 review with a personal card on the live site, uploads a small reference PDF, walks it to QA, refunds it via `/ops` (proves purchase, webhook, pipeline, QA, refund, and the audit trail in one pass).
3. Point DNS; re-run smoke on the public domain; verify Stripe webhook deliveries show 200s.
4. Arm all alerts; verify one test page reaches the phone.
5. Go quiet and watch the first organic case end-to-end before any marketing push.
**Rollback:** previous image redeploy (P0-3); DB migrations are additive-only to date — keep that discipline through launch week.

## 7. What this does NOT cover

App-level launch gates tracked elsewhere (runbook §Blocked-on-external): deadline-vector counsel sign-off, UPL/privacy review, E&O, TX tax determination. Deferred-by-scope engineering (multipart uploads, dashboards-as-code, ELT) per the implementation plan ledger.
