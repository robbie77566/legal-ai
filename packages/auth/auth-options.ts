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

        if (!checkRateLimit(credentials.email)) {
          throw new Error('RateLimit');
        }

        let user;
        try {
          user = await prisma.user.findUnique({
            where: { email: credentials.email }
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

        clearRateLimit(credentials.email);

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
              return null as any; // Force re-authentication for stale sessions
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
