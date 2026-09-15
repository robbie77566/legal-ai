process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, afterAll } from 'vitest';
import { fastify } from '../src/index';

/**
 * The buy page offers the promo field on the disclosure step, BEFORE the
 * account is created (promo_codes.md §3) — but validation required a session
 * and answered 401, so the spec's driving use case (free early-adopter codes
 * for families who by definition have no account yet) could not work at all.
 *
 * These assert the gate, not the code lookup: a DB-backed answer is covered by
 * checkout.integration.test.ts. What matters here is that an anonymous request
 * gets PAST authentication and is answered by the route.
 */
describe('promo validation is reachable before an account exists', () => {
  afterAll(async () => { await fastify.close(); });

  it('does not 401 an anonymous validate request', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/checkout/promo/validate',
      payload: { code: 'EARLYBIRD' },
    });
    expect(res.statusCode).not.toBe(401);
  });

  it('still refuses an anonymous request to a route that needs identity', async () => {
    const res = await fastify.inject({ method: 'POST', url: '/checkout/session', payload: { kind: 'review' } });
    expect(res.statusCode).toBe(401);
  });

  it('keeps redemption itself behind authentication', async () => {
    // The once-per-account rule and the atomic redeem live at /checkout/session;
    // making the preview public must not open the redeeming path.
    const res = await fastify.inject({
      method: 'POST',
      url: '/checkout/session',
      payload: { kind: 'review', promoCode: 'EARLYBIRD' },
    });
    expect(res.statusCode).toBe(401);
  });
});
