/** @type {import('next').NextConfig} */
const nextConfig = {
  // The verification gate builds while `next dev` may be running; a shared
  // .next directory lets the production build corrupt the dev server's
  // incremental cache (learned live: routes 404 until a clean restart).
  // The gate sets NEXT_DIST_DIR=.next-gate to build in isolation.
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

export default nextConfig
