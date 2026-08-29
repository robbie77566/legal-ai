import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { decodeSessionToken, type SessionIdentity } from '@hg/auth'

declare module 'fastify' {
  interface FastifyRequest {
    auth: SessionIdentity
  }
}

/**
 * Global authentication (system design §10.1): every route requires a verified
 * NextAuth session token; request identity comes ONLY from the token. The
 * legacy x-tenant-id / x-user-id headers are dead — any value sent in them is
 * ignored.
 *
 * Public paths are an explicit allowlist, not a pattern.
 */
const PUBLIC_PATHS = new Set(['/', '/health'])

const SESSION_COOKIES = [
  '__Secure-next-auth.session-token',
  'next-auth.session-token',
]

// Parsed here rather than via @fastify/cookie so this hook has no ordering
// dependency on another plugin's onRequest hook.
function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim())
  }
  return cookies
}

function extractToken(request: FastifyRequest): string | undefined {
  const cookies = parseCookieHeader(request.headers.cookie)
  for (const name of SESSION_COOKIES) {
    if (cookies[name]) return cookies[name]
  }
  const header = request.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return undefined
}

export function registerAuth(fastify: FastifyInstance) {
  fastify.decorateRequest('auth')

  fastify.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.url.split('?')[0]
      if (PUBLIC_PATHS.has(path)) return

      const token = extractToken(request)
      const identity = token ? await decodeSessionToken(token) : null

      if (!identity) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }

      // Ops surfaces are ADMIN-only (Bull Board at /admin/queues).
      if (path.startsWith('/admin') && identity.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Forbidden' })
      }

      request.auth = identity
    }
  )
}
