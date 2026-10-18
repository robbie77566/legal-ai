# Dependency audit — accepted advisories

CI runs `pnpm audit --audit-level critical`; a critical advisory fails the job (it shows up as the "Lint, Build & Test" job failing, which is why it reads as a lint failure in the notification emails). Advisories listed in `pnpm-workspace.yaml → auditConfig.ignoreGhsas` (pnpm 11 reads settings from the workspace file, not the package.json `pnpm` field) are accepted **with a reason and an exit condition** recorded here. Nothing is ignored silently.

| Advisory | Package | Why it does not apply to us | Exit condition |
|---|---|---|---|
| GHSA-p293-qw3h-jr36 — Unauthenticated RCE on **Windows-hosted** servers | next 14.2.35 (< 15.5.24) | Both services run on Render's Linux hosts; there is no Windows deployment path. | Remove the ignore when Next is upgraded to ≥ 15.5.24. |
| GHSA-2xp9-vwfh-vxw4 — RCE in the **Image Optimization API** when AVIF files are used | next 14.2.35 (< 15.5.24) | The app never uses `next/image`; `next.config.mjs` sets `images.unoptimized = true`, and Next 14 then answers `/_next/image` with a **404** before any optimizer code runs (`server/next-server.js`, `imagesConfig.unoptimized → render404`). The endpoint is closed. Verified in production after deploy: `curl -I https://www.snotnoselegal.com/_next/image?url=/x.avif&w=64&q=75` → 404. | Remove the ignore when Next is upgraded to ≥ 15.5.24. |
| GHSA-5gmw-xhrv-c9v3 — Prototype-pollution gadget to RCE in **worker options** | tinypool 1.1.1 (< 2.1.1) | tinypool is vitest's worker pool: a devDependency used only to run the test suites. It is not in either production build (`apps/api` bundles with tsup; `apps/web` is a Next build) and no production code path imports it. The gadget needs attacker-controlled worker options inside a test run. | Remove the ignore when vitest is upgraded to a major that depends on tinypool ≥ 2.1.2 (vitest 3.2 pins `^1.1.1`; vitest 4+ uses the 2.x line). |
| GHSA-85c8-ppgw-ccpr — Prototype-pollution gadget to RCE in **run() options** | tinypool 1.1.1 (< 2.1.2) | Same package, same dev-only exposure. | Same exit condition. |

## Pinned transitive packages (`pnpm-workspace.yaml → overrides`, 2026-10-18)

Two critical advisories were in transitive *runtime* dependencies with a patch-level fix available, so they are pinned rather than accepted:

| Advisory | Package | Reached through | Pin |
|---|---|---|---|
| GHSA-jqcg-44mw-7w3h — IP spoofing via IPv4-mapped IPv6 trust subnet | proxy-addr | `@modelcontextprotocol/sdk` → express (packages/mcp) | `>=2.0.8` |
| GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f — JavaScript injection in `compile` | handlebars | `@langchain/community` → `@langchain/classic` (packages/ai) | `>=4.7.10` |

An override is a floor, not a fork: when the dependents move past these versions on their own, the lines become no-ops and can be deleted.

## Tracked: Next.js 15.5.24+ upgrade

The real fix for both is the Next 15 line. It is a major upgrade from 14.2 (async request APIs — `cookies()`, `headers()`, route `params` become promises; new caching defaults; React 19), so it is scheduled as its own change with the full gate, not folded into a security patch. Until then the two accepted advisories above are re-checked whenever `pnpm audit` reports anything new for `next`.

## How to re-check

```
pnpm audit --audit-level critical          # what CI runs
pnpm audit --audit-level critical --json   # advisory ids (github_advisory_id)
```
