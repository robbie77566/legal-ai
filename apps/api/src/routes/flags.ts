import type { FastifyInstance } from 'fastify'
import { listFlags, type FlagKey } from '@hg/database/flags'

/**
 * GET /flags — the effective feature-flag map for the caller's tenant,
 * `{ counsel_surfaces: false, ... }`. Authenticated like every route; the web
 * app reads it server-side (apps/web/lib/flags.ts) to decide which doors to
 * render. Values only — descriptions and overrides are staff business
 * (/ops/flags).
 */
export default async function flagsRoutes(fastify: FastifyInstance) {
  fastify.get('/flags', async (request) => {
    const views = await listFlags(request.auth.tenantId)
    const map = {} as Record<FlagKey, boolean>
    for (const v of views) map[v.key] = v.effective
    return map
  })
}
