# Dependency audit — accepted advisories

CI runs `pnpm audit --audit-level critical`; a critical advisory fails the job (it shows up as the "Lint, Build & Test" job failing, which is why it reads as a lint failure in the notification emails). Advisories listed in `pnpm-workspace.yaml → auditConfig.ignoreGhsas` (pnpm 11 reads settings from the workspace file, not the package.json `pnpm` field) are accepted **with a reason and an exit condition** recorded here. Nothing is ignored silently.

| Advisory | Package | Why it does not apply to us | Exit condition |
|---|---|---|---|
| GHSA-p293-qw3h-jr36 — Unauthenticated RCE on **Windows-hosted** servers | next 14.2.35 (< 15.5.24) | Both services run on Render's Linux hosts; there is no Windows deployment path. | Remove the ignore when Next is upgraded to ≥ 15.5.24. |
| GHSA-2xp9-vwfh-vxw4 — RCE in the **Image Optimization API** when AVIF files are used | next 14.2.35 (< 15.5.24) | The app never uses `next/image`; `next.config.mjs` sets `images.unoptimized = true`, and Next 14 then answers `/_next/image` with a **404** before any optimizer code runs (`server/next-server.js`, `imagesConfig.unoptimized → render404`). The endpoint is closed. Verified in production after deploy: `curl -I https://www.snotnoselegal.com/_next/image?url=/x.avif&w=64&q=75` → 404. | Remove the ignore when Next is upgraded to ≥ 15.5.24. |

## Tracked: Next.js 15.5.24+ upgrade

The real fix for both is the Next 15 line. It is a major upgrade from 14.2 (async request APIs — `cookies()`, `headers()`, route `params` become promises; new caching defaults; React 19), so it is scheduled as its own change with the full gate, not folded into a security patch. Until then the two accepted advisories above are re-checked whenever `pnpm audit` reports anything new for `next`.

## How to re-check

```
pnpm audit --audit-level critical          # what CI runs
pnpm audit --audit-level critical --json   # advisory ids (github_advisory_id)
```
