import { decode, encode } from 'next-auth/jwt'

/**
 * The identity the Fastify API derives from a verified NextAuth session token.
 * This is the ONLY sanctioned source of userId/tenantId/role on the API —
 * the legacy x-tenant-id / x-user-id headers are removed (system design §10.1).
 */
export interface SessionIdentity {
  userId: string
  tenantId: string
  role: string
}

const secret = () => {
  const s = process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('NEXTAUTH_SECRET is not set')
  return s
}

/**
 * Decrypt and validate a NextAuth v4 session token (JWE). Returns null for
 * missing/invalid/expired tokens or tokens missing the identity claims that
 * auth-options.ts stamps at sign-in.
 */
export async function decodeSessionToken(
  token: string
): Promise<SessionIdentity | null> {
  try {
    const payload = await decode({ token, secret: secret() })
    if (!payload) return null
    const { id, tenantId, role } = payload as {
      id?: unknown
      tenantId?: unknown
      role?: unknown
    }
    if (
      typeof id !== 'string' ||
      typeof tenantId !== 'string' ||
      typeof role !== 'string'
    ) {
      return null
    }
    return { userId: id, tenantId, role }
  } catch {
    return null
  }
}

/** Test helper: mint a session token the API's decodeSessionToken accepts. */
export async function encodeSessionToken(
  identity: SessionIdentity,
  maxAge = 60 * 60
): Promise<string> {
  return encode({
    token: { id: identity.userId, tenantId: identity.tenantId, role: identity.role },
    secret: secret(),
    maxAge,
  })
}
