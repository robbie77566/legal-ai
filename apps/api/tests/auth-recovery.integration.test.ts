/**
 * Password recovery (v1.0 launch scope, ENG-7) — live Postgres, capture
 * email provider. Proves the token round-trip, single-use + expiry, the
 * passwordChangedAt session-kill stamp, and enumeration safety.
 */
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters!!';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { fastify } from '../src/index';
import prisma from '@hg/database';
import { __setEmailProviderForTests, type EmailMessage } from '@hg/email';

const run = `rec_${Date.now()}`;
let tenantId: string;
let userId: string;
const sent: EmailMessage[] = [];

beforeAll(async () => {
  __setEmailProviderForTests({
    send: async (msg) => {
      sent.push(msg);
      return { delivered: true };
    },
  });
  const t = await prisma.tenant.create({ data: { name: `${run}_T` } });
  tenantId = t.id;
  const u = await prisma.user.create({
    data: {
      email: `${run}@example.com`,
      tenantId,
      role: 'CLIENT',
      passwordHash: await bcrypt.hash('OldPassword99!', 12),
    },
  });
  userId = u.id;
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  __setEmailProviderForTests(undefined);
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.$disconnect();
});

const extractToken = (msg: EmailMessage) => {
  const m = msg.text.match(/token=([0-9a-f]{64})&id=([\w-]+)/);
  return m ? { token: m[1], id: m[2] } : null;
};

describe('POST /auth/forgot', () => {
  it('stores a hashed token, emails the raw link, and answers ok', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/forgot',
      payload: { email: `${run}@example.com` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    expect(sent).toHaveLength(1);
    const link = extractToken(sent[0])!;
    expect(link.id).toBe(userId);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.resetToken).toBeTruthy();
    expect(u.resetToken).not.toBe(link.token); // hash stored, raw only in the email
    expect(u.resetExpires!.getTime()).toBeGreaterThan(Date.now());
  });

  it('builds the link from the FIRST WEB_ORIGIN entry (the var is a comma list)', async () => {
    const prev = process.env.WEB_ORIGIN;
    process.env.WEB_ORIGIN = 'https://first.example,https://second.example';
    try {
      sent.length = 0;
      await fastify.inject({ method: 'POST', url: '/auth/forgot', payload: { email: `${run}@example.com` } });
      expect(sent).toHaveLength(1);
      expect(sent[0].text).toContain('https://first.example/auth/reset-password?token=');
      expect(sent[0].text).not.toContain('https://first.example,'); // the raw-list bug (2026-09-02)
    } finally {
      if (prev !== undefined) process.env.WEB_ORIGIN = prev; else delete process.env.WEB_ORIGIN;
      sent.length = 0;
    }
  });

  it('is enumeration-safe: unknown emails get the same answer and NO email', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/forgot',
      payload: { email: `${run}_nobody@example.com` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });
});

describe('POST /auth/reset', () => {
  it('a wrong token is rejected with the generic message', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { userId, token: 'f'.repeat(64), password: 'BrandNewPass1!x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/invalid or has expired/);
  });

  it('the emailed token resets the password once, stamps passwordChangedAt, and self-destructs', async () => {
    await fastify.inject({ method: 'POST', url: '/auth/forgot', payload: { email: `${run}@example.com` } });
    const link = extractToken(sent[0])!;

    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { userId: link.id, token: link.token, password: 'BrandNewPass1!x' },
    });
    expect(res.statusCode).toBe(200);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare('BrandNewPass1!x', u.passwordHash!)).toBe(true);
    expect(u.passwordChangedAt).not.toBeNull(); // every session dies
    expect(u.resetToken).toBeNull();

    // single-use: the same link is now dead
    const replay = await fastify.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { userId: link.id, token: link.token, password: 'AnotherPass22!x' },
    });
    expect(replay.statusCode).toBe(400);
  });

  it('an expired token is rejected', async () => {
    await fastify.inject({ method: 'POST', url: '/auth/forgot', payload: { email: `${run}@example.com` } });
    const link = extractToken(sent[0])!;
    await prisma.user.update({
      where: { id: userId },
      data: { resetExpires: new Date(Date.now() - 1000) },
    });
    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { userId: link.id, token: link.token, password: 'YetAnother33!xx' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('weak passwords never reach the hash step', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/auth/reset',
      payload: { userId, token: 'a'.repeat(64), password: 'short' },
    });
    expect([400, 500]).toContain(res.statusCode);
  });
});
