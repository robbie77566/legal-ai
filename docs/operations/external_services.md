# External Services & Tools Register

**Updated:** 2026-08-31 · The canonical list of every third-party service the product depends on: what it does, what it costs monthly, when the cost changes, and where its credential lives. Prices are current published tiers; the launch column is what we actually pay at go-live volumes.

## Fixed monthly (infrastructure & operations)

| Service | Purpose | Tier at launch | $/mo | When it grows |
|---|---|---|---:|---|
| **Render — web** | Next.js customer site (landing, funnel, reports, /qa, /ops) | Starter (512MB) | $7 | Standard $25 if SSR load demands |
| **Render — api** | Fastify API + BullMQ workers + outbox (the product's engine) | Standard (2GB — analysis jobs hold multi-MB records) | $25 | Scale-out post-AWS-graduation |
| **Render — Postgres 16** | System of record; pgvector; **native PITR (§11a.2 backup bound)** | Basic-1GB | ~$20 | Storage/connections at volume |
| **Render — Key Value (Redis)** | BullMQ queues, SSE pub/sub, rate limiting (`noeviction`) | Starter | $10 | Rarely — queues are tiny |
| **Render — clamav** | ENG-4 malware scan gate (private service; signatures need ~2GB) | Standard | $25 | Fixed |
| **Domain** (snotnoselegal.com) | The brand; DNS for web/api/email | annual ~$15/yr | ~$1 | Fixed |
| **Fixed subtotal** | | | **~$88** | vs. $150/mo budgeted in the business case §8c — favorable |

## Usage-based (COGS — scales with cases, already in the per-case model)

| Service | Purpose | Pricing | Per-case reality (measured) |
|---|---|---|---|
| **Anthropic API** | Claude Opus 5 analysis engine (screens, context pre-pass, batch 50%) | per token | ~$1.75–3.30/case (batch validated); dual-engine Advanced tier roughly doubles it |
| **AWS Textract** | OCR for scanned volumes | $1.50/1k pages | ~$0.90 avg case |
| **AWS S3** (2 buckets) | Customer documents + encrypted eval corpus | storage/requests/egress | < $5/mo at launch volumes |
| **Stripe** | Payments, refunds, installments, Stripe Tax | 2.9% + $0.30 (+0.5% tax calc) | ~$9 on a $299 sale |

## Free tier at launch (upgrade triggers noted)

| Service | Purpose | Free covers | Paid trigger |
|---|---|---|---|
| **Resend** | All transactional email (receipts, status, report-ready, resets) | 3k emails/mo | Pro $20/mo past ~100 cases/mo |
| **Sentry** | Production error tracking + alert routing to the founder's phone | 5k events/mo | Team ~$26/mo — if errors exceed this, price isn't the problem |
| **PostHog** | snl.* funnel analytics + palette A/B experiment | 1M events/mo | Far beyond launch scale |
| **UptimeRobot** | `/healthz` + landing uptime checks | 50 monitors, 5-min | Effectively never |
| **GitHub** | Repo, CI (typecheck/tests/gitleaks/audit), Dependabot | private repo + 2k Action min/mo | Team $4/user if collaborators join |
| **Google Fonts** | Daybreak/IA typefaces | free | n/a |

## Not in production (for completeness)

- **Neo4j** — decommissioned pre-launch (post-MVP graph work re-adds deliberately).
- **Twilio/SMS** — P2 recommendation from the mobile UX review; unpriced until pursued.
- **AWS compute (ECS/RDS)** — the designated scale-up destination (readiness §2); $0 today.

## The bottom line

**Fixed: ~$88/mo** (~$113 if the web service needs Standard) — under the $150/mo hosting line in the solo-founder cash model (§8c), leaving headroom for the first paid-tier upgrades (Resend, Sentry) inside the same budget. **Variable: ~$12–15/case COGS** across Anthropic + Textract + Stripe, consistent with the ≤$54 COGS ceiling (NFR-4) with wide margin. Credentials for every service live in Render's env store (go-live P0-5) — nothing in files, everything rotatable in one place.
