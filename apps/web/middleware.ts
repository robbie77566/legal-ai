import { withAuth } from 'next-auth/middleware';
import { isAuthorized } from '@/lib/route-access';

/**
 * Route protection + ROLE matrix (auth design §12.4, system design §10.2).
 * The middleware is UX-level gating; the API re-enforces the same matrix per
 * route and is the real gate. The matrix itself lives in lib/route-access.ts
 * (pure, unit-tested row by row):
 *
 *  - /counsel               : PROFESSIONAL accounts only (persona plan A);
 *                             /counsel/join is left out — an invitation is
 *                             accepted signed out (token-verified by the API)
 *  - /qa                    : ADMIN | ATTORNEY
 *  - /ops                   : ADMIN | SUPPORT (the API narrows SUPPORT to reads + unblocking actions)
 *  - /case                  : any authenticated user (CLIENT's home turf)
 *
 * /buy is NOT matched: its entry steps (disclosure review, account creation)
 * are anonymous by design (landing spec §3); its authed API calls gate
 * themselves.
 */
export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => isAuthorized(req.nextUrl.pathname, token),
  },
  pages: { signIn: '/auth/signin' },
});

export const config = {
  matcher: [
    '/counsel',
    '/counsel/((?!join$|join/).*)',
    '/qa/:path*',
    '/ops/:path*',
    '/case/:path*',
    '/cases',
    '/account',
    '/account/((?!confirm-email).*)', // the confirm link works signed out — token-verified
  ],
};
