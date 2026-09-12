/** @type {import('next').NextConfig} */
const nextConfig = {
  // The verification gate builds while `next dev` may be running; a shared
  // .next directory lets the production build corrupt the dev server's
  // incremental cache (learned live: routes 404 until a clean restart).
  // The gate sets NEXT_DIST_DIR=.next-gate to build in isolation.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Dependency audit 2026-09-12 (GHSA-2xp9-vwfh-vxw4): the Image Optimization
  // API (/_next/image) had a critical AVIF RCE in every Next < 15.5.24. We
  // never use next/image, and with `unoptimized` Next 14 answers that route
  // with a 404 (server/next-server.js) — the endpoint is closed, not patched.
  // Exit condition: the Next 15.5.24+ upgrade (docs/operations/dependency_audit.md).
  images: { unoptimized: true },
}

export default nextConfig
