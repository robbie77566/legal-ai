import { describe, it, expect } from 'vitest';
import { fastify } from '../src/index';

describe('Fastify API Routes', () => {
  it('should return hello world on the root route', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ hello: 'world' });
  });
});
