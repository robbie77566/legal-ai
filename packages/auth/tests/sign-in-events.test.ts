/**
 * W1 — the sign-in recorder and the admin's first-sign-in alert, against a
 * mocked prisma and a capture SMS provider. A first successful sign-in
 * records SUCCESS with firstSignIn and sends exactly one SMS carrying the
 * masked email, the kind, the organisation and the /ops/accounts/<id> link;
 * a second sign-in records and sends nothing; every failure outcome records
 * without an SMS; ADMIN_SMS_TO unset = no SMS; the flood guard stops the
 * 21st alert in an hour; a prisma failure never escapes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  create: vi.fn(),
  orgFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@hg/database', () => ({
  default: {
    signInAttempt: { create: db.create },
    organisation: { findUnique: db.orgFindUnique },
    $transaction: db.transaction,
  },
}));

import { __setSmsProviderForTests } from '@hg/sms';
import {
  recordSignInAttempt, clientOf, maskEmail, buildFirstSignInSms, __resetSignInAlertGuardForTests, ALERT_MAX_PER_HOUR, FIRST_SIGN_IN_ACTION,
} from '../sign-in-events';

const sent: Array<{ to: string; body: string }> = [];
const FAMILY = { id: 'u_fam', email: 'robbie@gmail.com', name: 'Robbie Bruce', tenantId: 't_fam', accountKind: 'FAMILY', loginCount: 0, createdAt: new Date('2026-10-30T15:00:00Z') };
const COUNSEL = { id: 'u_pro', email: 'dana@firm.example', name: 'Dana Ortiz', tenantId: 't_pro', accountKind: 'PROFESSIONAL', loginCount: 0, createdAt: new Date('2026-10-29T09:00:00Z') };

beforeEach(() => {
  sent.length = 0;
  __resetSignInAlertGuardForTests();
  __setSmsProviderForTests({ async send(to, body) { sent.push({ to, body }); return { delivered: true, id: 'SM1' }; } });
  db.create.mockReset().mockResolvedValue({ id: 'a1' });
  db.orgFindUnique.mockReset().mockResolvedValue(null);
  db.auditCreate.mockReset().mockResolvedValue({ id: 'al1' });
  db.executeRaw.mockReset().mockResolvedValue(1);
  db.transaction.mockReset().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ $executeRaw: db.executeRaw, auditLog: { create: db.auditCreate } })
  );
  vi.stubEnv('ADMIN_SMS_TO', '+15125550100');
  vi.stubEnv('NEXTAUTH_URL', 'https://www.snotnoselegal.com/');
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  __setSmsProviderForTests(undefined);
});

describe('first successful sign-in', () => {
  it('records SUCCESS with firstSignIn and sends exactly one SMS: masked email, kind, organisation, the account link', async () => {
    db.orgFindUnique.mockResolvedValue({ name: 'Ortiz & Vale PLLC' });
    const r = await recordSignInAttempt({ email: 'Dana@Firm.example', user: COUNSEL, outcome: 'SUCCESS', ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)' });
    expect(r).toEqual({ recorded: true, firstSignIn: true, alerted: true });
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(db.create.mock.calls[0][0].data).toEqual({
      email: 'dana@firm.example', userId: 'u_pro', tenantId: 't_pro', outcome: 'SUCCESS', firstSignIn: true, ip: '203.0.113.9', userAgent: 'Mozilla/5.0 (iPhone)',
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('+15125550100');
    const body = sent[0].body;
    expect(body).toContain('d•••@firm.example');
    expect(body).not.toContain('dana@firm.example');
    expect(body).toContain('PROFESSIONAL');
    expect(body).toContain('Ortiz & Vale PLLC');
    expect(body).toContain('Dana Ortiz');
    expect(body).toContain('created 2026-10-29');
    expect(body).toContain('https://www.snotnoselegal.com/ops/accounts/u_pro');
    expect(body.length).toBeLessThan(320);
    expect(db.orgFindUnique).toHaveBeenCalledWith({ where: { tenantId: 't_pro' }, select: { name: true } });
  });

  it('a family account with no organisation reads "no name" / "—" and still links the account', async () => {
    const r = await recordSignInAttempt({ email: 'robbie@gmail.com', user: { ...FAMILY, name: null }, outcome: 'SUCCESS' });
    expect(r.firstSignIn).toBe(true);
    expect(sent[0].body).toBe('New sign-in: no name · family (FAMILY · —) · created 2026-10-30 · r•••@gmail.com. https://www.snotnoselegal.com/ops/accounts/u_fam');
  });

  it('writes one AuditLog row — FIRST_SIGN_IN, the userId only, scoped to the tenant, never the IP', async () => {
    await recordSignInAttempt({ email: FAMILY.email, user: FAMILY, outcome: 'SUCCESS', ip: '203.0.113.9', userAgent: 'UA' });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.executeRaw).toHaveBeenCalledTimes(1);
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
    const data = db.auditCreate.mock.calls[0][0].data;
    expect(data).toEqual({ caseId: 'account:u_fam', tenantId: 't_fam', action: FIRST_SIGN_IN_ACTION, userId: 'u_fam', details: { userId: 'u_fam' } });
    expect(JSON.stringify(data)).not.toContain('203.0.113.9');
    expect(JSON.stringify(data)).not.toContain('UA');
  });

  it('a second sign-in (loginCount 1) records without an SMS or an audit row', async () => {
    const r = await recordSignInAttempt({ email: FAMILY.email, user: { ...FAMILY, loginCount: 1 }, outcome: 'SUCCESS' });
    expect(r).toEqual({ recorded: true, firstSignIn: false, alerted: false });
    expect(db.create.mock.calls[0][0].data.firstSignIn).toBe(false);
    expect(sent).toHaveLength(0);
    expect(db.auditCreate).not.toHaveBeenCalled();
  });
});

describe('failure outcomes record and never alert', () => {
  it.each([
    ['BAD_PASSWORD', FAMILY],
    ['NO_PASSWORD', { ...FAMILY, loginCount: 0 }],
    ['RATE_LIMITED', null],
    ['UNKNOWN_EMAIL', null],
  ] as const)('%s', async (outcome, user) => {
    const r = await recordSignInAttempt({ email: 'someone@example.com', user, outcome, ip: '198.51.100.7', userAgent: 'curl/8' });
    expect(r).toEqual({ recorded: true, firstSignIn: false, alerted: false });
    const data = db.create.mock.calls[0][0].data;
    expect(data.outcome).toBe(outcome);
    expect(data.firstSignIn).toBe(false);
    expect(data.userId).toBe(user ? user.id : null);
    expect(data.tenantId).toBe(user ? user.tenantId : null);
    expect(sent).toHaveLength(0);
    expect(db.auditCreate).not.toHaveBeenCalled();
  });
});

describe('guards', () => {
  it('ADMIN_SMS_TO unset → the attempt is recorded, the audit row is written, no SMS', async () => {
    vi.stubEnv('ADMIN_SMS_TO', '');
    const r = await recordSignInAttempt({ email: FAMILY.email, user: FAMILY, outcome: 'SUCCESS' });
    expect(r).toEqual({ recorded: true, firstSignIn: true, alerted: false });
    expect(sent).toHaveLength(0);
    expect(db.auditCreate).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('ADMIN_SMS_TO not set'));
  });

  it(`the flood guard suppresses the ${ALERT_MAX_PER_HOUR + 1}st alert in an hour, still recording the attempt`, async () => {
    for (let i = 0; i < ALERT_MAX_PER_HOUR; i++) {
      const r = await recordSignInAttempt({ email: `p${i}@example.com`, user: { ...FAMILY, id: `u${i}`, email: `p${i}@example.com` }, outcome: 'SUCCESS' });
      expect(r.alerted).toBe(true);
    }
    expect(sent).toHaveLength(ALERT_MAX_PER_HOUR);
    const r = await recordSignInAttempt({ email: 'late@example.com', user: { ...FAMILY, id: 'u_late', email: 'late@example.com' }, outcome: 'SUCCESS' });
    expect(r).toEqual({ recorded: true, firstSignIn: true, alerted: false });
    expect(sent).toHaveLength(ALERT_MAX_PER_HOUR);
    expect(db.create).toHaveBeenCalledTimes(ALERT_MAX_PER_HOUR + 1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[sms] alert suppressed'));
  });

  it('a prisma failure on the row never throws; the first-sign-in alert still goes out', async () => {
    db.create.mockRejectedValue(new Error('connection refused'));
    const r = await recordSignInAttempt({ email: FAMILY.email, user: FAMILY, outcome: 'SUCCESS' });
    expect(r).toEqual({ recorded: false, firstSignIn: true, alerted: true });
    expect(console.error).toHaveBeenCalledWith('[sign-in] could not record attempt:', 'connection refused');
  });

  it('an audit failure and an SMS provider failure are swallowed too', async () => {
    db.transaction.mockRejectedValue(new Error('rls'));
    __setSmsProviderForTests({ async send() { throw new Error('boom'); } });
    const r = await recordSignInAttempt({ email: FAMILY.email, user: FAMILY, outcome: 'SUCCESS' });
    expect(r).toEqual({ recorded: true, firstSignIn: true, alerted: false });
  });

  it('truncates the IP to 45 and the user agent to 256 characters, and lower-cases the email as typed', async () => {
    await recordSignInAttempt({ email: '  Mixed.Case@Example.COM ', user: null, outcome: 'UNKNOWN_EMAIL', ip: 'x'.repeat(80), userAgent: 'y'.repeat(400) });
    const data = db.create.mock.calls[0][0].data;
    expect(data.email).toBe('mixed.case@example.com');
    expect(data.ip).toHaveLength(45);
    expect(data.userAgent).toHaveLength(256);
  });
});

describe('helpers', () => {
  it('clientOf takes the first x-forwarded-for address, else x-real-ip, and the user agent; no request = nulls', () => {
    expect(clientOf({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1', 'user-agent': 'UA/1' } })).toEqual({ ip: '203.0.113.9', userAgent: 'UA/1' });
    expect(clientOf({ headers: { 'x-real-ip': '198.51.100.7' } })).toEqual({ ip: '198.51.100.7', userAgent: null });
    expect(clientOf({ headers: new Headers({ 'X-Forwarded-For': '2001:db8::1', 'User-Agent': 'H' }) })).toEqual({ ip: '2001:db8::1', userAgent: 'H' });
    expect(clientOf(undefined)).toEqual({ ip: null, userAgent: null });
    expect(clientOf({})).toEqual({ ip: null, userAgent: null });
  });
  it('maskEmail keeps the first character and the domain', () => {
    expect(maskEmail('robbie@gmail.com')).toBe('r•••@gmail.com');
    expect(maskEmail('nope')).toBe('•••');
  });
  it('a staging console marks the body "[staging]" like the email subjects; production does not', () => {
    const staging = buildFirstSignInSms({ userId: 'u1', email: 'r@gmail.com', origin: 'https://staging.snotnoselegal.com' });
    expect(staging.startsWith('[staging] New sign-in:')).toBe(true);
    expect(staging).toContain('https://staging.snotnoselegal.com/ops/accounts/u1');
    const prod = buildFirstSignInSms({ userId: 'u1', email: 'r@gmail.com', origin: 'https://www.snotnoselegal.com' });
    expect(prod.startsWith('New sign-in:')).toBe(true);
  });
  it('buildFirstSignInSms stays under 320 characters with long names and organisations', () => {
    const body = buildFirstSignInSms({ userId: 'c'.repeat(25), name: 'N'.repeat(200), email: `${'e'.repeat(60)}@example.com`, accountKind: 'PROFESSIONAL', organisationName: 'O'.repeat(200), createdAt: new Date(), origin: 'https://www.snotnoselegal.com' });
    expect(body.length).toBeLessThan(320);
    expect(body).toContain(`/ops/accounts/${'c'.repeat(25)}`);
  });
});
