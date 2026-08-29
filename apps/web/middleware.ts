import { withAuth } from 'next-auth/middleware';

/**
 * Route protection + ROLE matrix (auth design §12.4, system design §10.2).
 * The middleware is UX-level gating; the API re-enforces the same matrix per
 * route and is the real gate.
 *
 *  - /dashboard, /workspace : staff only (never CLIENT)
 *  - /qa                    : ADMIN | ATTORNEY
 *  - /ops                   : ADMIN
 *  - /case                  : any authenticated user (CLIENT's home turf)
 *
 * /buy is NOT matched: its entry steps (disclosure review, account creation)
 * are anonymous by design (landing spec §3); its authed API calls gate
 * themselves.
 */
const STAFF_ROLES = new Set(['ADMIN', 'ATTORNEY', 'INVESTIGATOR', 'VIEWER']);

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      if (!token) return false;
      const role = typeof token.role === 'string' ? token.role : '';
      const path = req.nextUrl.pathname;

      if (path.startsWith('/ops')) return role === 'ADMIN';
      if (path.startsWith('/qa')) return role === 'ADMIN' || role === 'ATTORNEY';
      if (path.startsWith('/dashboard') || path.startsWith('/workspace')) {
        return STAFF_ROLES.has(role);
      }
      return true; // /case — authentication is the only requirement here
    },
  },
  pages: { signIn: '/auth/signin' },
});

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/workspace/:path*',
    '/qa/:path*',
    '/ops/:path*',
    '/case/:path*',
  ],
};
