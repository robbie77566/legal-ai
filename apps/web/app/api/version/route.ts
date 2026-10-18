import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Which build is serving? Render sets RENDER_GIT_COMMIT on every deploy; the
 * post-deploy E2E workflow polls this until it sees the commit it pushed.
 * Public and harmless: a commit hash of an open deployment is not a secret.
 */
export function GET() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- set by Render, not by the build
  const commit = process.env.RENDER_GIT_COMMIT || null
  return NextResponse.json({ commit }, { headers: { 'cache-control': 'no-store' } })
}
