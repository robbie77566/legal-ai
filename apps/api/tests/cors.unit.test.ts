import { describe, it, expect, afterAll } from 'vitest';
import { fastify } from '../src/index';

/** Prod 2026-09-12: the promo "deactivate" link did nothing — the browser's
 *  PATCH preflight got 204 with only GET,HEAD,POST allowed, so no PATCH or
 *  DELETE ever left the page. Every method the app uses must be allowed. */
describe('CORS preflight', () => {
  afterAll(async () => { await fastify.close(); });
  for (const method of ['PATCH', 'DELETE', 'PUT', 'POST']) {
    it(`allows ${method} from the web origin`, async () => {
      const res = await fastify.inject({
        method: 'OPTIONS', url: '/ops/promos/abc',
        headers: { origin: 'http://localhost:3000', 'access-control-request-method': method, 'access-control-request-headers': 'content-type' },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(String(res.headers['access-control-allow-methods'])).toContain(method);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  }
});
