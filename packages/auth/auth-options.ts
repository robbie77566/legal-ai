// Type-only reference so the Session/User/JWT augmentation travels with this
// module into every program that compiles it (the API's tsconfig included)
// without emitting a runtime import bundlers would try to resolve.
/// <reference path="./types/next-auth.d.ts" />
import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import prisma from "@hg/database"
import bcrypt from "bcryptjs"

// Pre-computed at startup so the timing-safe path runs the same bcrypt cost as real logins.
// This prevents account enumeration: both "no account" and "wrong password" take ~300ms.
const TIMING_SAFE_DUMMY_HASH = bcrypt.hashSync("__hg_timing_sentinel__", 12);

// In-memory rate limiter — resets on server restart; acceptable for Phase 1 scale.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(email);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(email, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function clearRateLimit(email: string): void {
  rateLimitMap.delete(email);
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // default: 1 day; extended to 30 days per-token when rememberMe=true
  },
  // Cross-subdomain session (prod): www sets the cookie, api.snotnoselegal.com
  // must RECEIVE it — NextAuth's default host-only cookie never reaches a
  // sibling subdomain, which would 401 every API call in production (dev
  // hides this: localhost ports share one cookie jar). COOKIE_DOMAIN is set
  // ONLY in prod (".snotnoselegal.com"); unset in dev, where a domain
  // attribute on localhost/LAN-IP hosts would break the cookie instead.
  ...(process.env.COOKIE_DOMAIN
    ? {
        cookies: {
          sessionToken: {
            // __Secure- prefix requires Secure (fine over HTTPS) and, unlike
            // __Host-, PERMITS a Domain attribute. The API's extractToken
            // already checks this name first.
            name: "__Secure-next-auth.session-token",
            options: {
              httpOnly: true,
              sameSite: "lax" as const,
              path: "/",
              secure: true,
              domain: process.env.COOKIE_DOMAIN,
            },
          },
        },
      }
    : {}),
  pages: {
    signIn: '/auth/signin',
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember me", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // Case-insensitive, trimmed: phone keyboards capitalize the first
        // letter, and an exact-match lookup then rejected a correct password
        // as "invalid email" (2026-09-05). Existing mixed-case rows still match.
        const email = credentials.email.trim().toLowerCase();
        if (!checkRateLimit(email)) {
          throw new Error('RateLimit');
        }

        let user;
        try {
          user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } }
          });
        } catch (err) {
          // DB unreachable or Prisma error — do not leak details to the client
          console.error('[Auth] Database error during authorize:', err);
          throw new Error('ServiceUnavailable');
        }

        if (!user?.passwordHash) {
          await bcrypt.compare(credentials.password, TIMING_SAFE_DUMMY_HASH);
          return null;
        }

        const passwordValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!passwordValid) return null;

        clearRateLimit(email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          tenantId: user.tenantId,
          role: user.role,
          rememberMe: credentials.rememberMe === 'true',
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Initial sign-in: populate token from user object
      if (user) {
        token.id = user.id;
        token.tenantId = (user as any).tenantId;
        token.role = (user as any).role;
        token.rememberMe = (user as any).rememberMe ?? false;
        if (token.rememberMe) {
          token.exp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
        }
        // authorize() just verified the CURRENT password, so this session's
        // staleness baseline is now. Without this, token.iat doesn't exist yet
        // on the initial call and the invalidation check below reads a baseline
        // of 0 — permanently locking out any account that has ever changed its
        // password (500 at the encode step, since the callback returned null).
        token.passwordAcknowledgedAt = Math.floor(Date.now() / 1000);
        return token;
      }

      // session.update() from client — handle name change and post-password-change refresh.
      // Setting passwordAcknowledgedAt prevents the password-change check from signing out
      // the session that just performed the change (other sessions still get invalidated).
      if (trigger === 'update') {
        if (session?.passwordChanged) {
          token.passwordAcknowledgedAt = Math.floor(Date.now() / 1000);
        }
        if (session?.name !== undefined) {
          token.name = session.name;
        }
      }

      // Per-request invalidation check: sign out sessions issued before the last password change.
      // One Prisma query per token refresh is acceptable at current scale; see engineering design §4.4.
      // Wrapped in try-catch: if DB is unreachable or the schema hasn't been migrated yet,
      // we skip the check rather than sign the user out.
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { passwordChangedAt: true, name: true }
          });

          if (dbUser?.passwordChangedAt) {
            const changedAtSec = dbUser.passwordChangedAt.getTime() / 1000;
            const baselineSec = Math.max(
              (token.iat as number) ?? 0,
              (token.passwordAcknowledgedAt as number) ?? 0
            );
            if (changedAtSec > baselineSec) {
              // Strip identity instead of returning null: null makes next-auth
              // encode() throw ("JWT Claims Set MUST be an object") and turns
              // every request into an empty 500. An identity-less token flows to
              // the session callback, which expires the session cleanly.
              return {} as any;
            }
          }

          if (dbUser?.name && !session?.name) {
            token.name = dbUser.name;
          }
        } catch (err) {
          // DB error during JWT refresh — skip invalidation check, keep session alive
          console.warn('[Auth] JWT refresh DB check skipped:', (err as Error).message);
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Invalidated token (password changed elsewhere): hand the client an
      // already-expired, identity-less session so useSession flips to
      // unauthenticated and the user is prompted to sign in again.
      if (!token.id) {
        return { ...session, user: {}, expires: new Date(0).toISOString() } as any;
      }
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).tenantId = token.tenantId as string;
        (session.user as any).role = token.role as string;
        session.user.name = token.name as string ?? session.user.name;
      }
      return session;
    },
  },
}
