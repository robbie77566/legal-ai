/**
 * W2 — the SMS seam. Console transport when the Twilio env is unset; the
 * Twilio transport posts the right URL, basic-auth header and form fields;
 * a 201 is `{ delivered: true, id }`, a 4xx is `{ delivered: false, error }`
 * and nothing ever throws out of sendSms.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { __setSmsProviderForTests, buildProvider, sendSms, smsConfigured, twilioMessagesUrl, SMS_MAX_BODY } from '../index';

beforeEach(() => {
  __setSmsProviderForTests(undefined);
  vi.stubEnv('TWILIO_ACCOUNT_SID', '');
  vi.stubEnv('TWILIO_AUTH_TOKEN', '');
  vi.stubEnv('TWILIO_FROM', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  __setSmsProviderForTests(undefined);
});

describe('console transport (Twilio env unset)', () => {
  it('logs "[sms] not delivered" with the body and reports delivered: false, without calling the network', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await sendSms('+15125550100', 'New sign-in: test');
    expect(r.delivered).toBe(false);
    expect(r.error).toMatch(/TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM not set/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[sms] not delivered');
    expect(String(warn.mock.calls[0][0])).toContain('New sign-in: test');
    expect(smsConfigured()).toBe(false);
  });

  it('names only the variables that are missing', () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACxxx');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'tok');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    return buildProvider().send('+1', 'x').then((r) => {
      expect(r.error).toBe('TWILIO_FROM not set on this service — logging only');
      expect(warn).toHaveBeenCalled();
    });
  });
});

describe('Twilio transport', () => {
  const SID = 'AC0123456789abcdef';
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', SID);
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret-token');
    vi.stubEnv('TWILIO_FROM', '+15125550199');
  });

  it('posts the Messages.json URL with HTTP basic auth and a form body; 201 → delivered with the message sid', async () => {
    const fetchSpy = vi.fn(async () => ({ status: 201, json: async () => ({ sid: 'SM123', status: 'queued' }) }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(smsConfigured()).toBe(true);
    const r = await sendSms('+15125550100', 'New sign-in: Maria');
    expect(r).toEqual({ delivered: true, id: 'SM123' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(twilioMessagesUrl(SID));
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from(`${SID}:secret-token`).toString('base64')}`);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(String(init.body));
    expect(form.get('To')).toBe('+15125550100');
    expect(form.get('From')).toBe('+15125550199');
    expect(form.get('Body')).toBe('New sign-in: Maria');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('a 4xx answers { delivered: false, error } with Twilio\'s message, and does not throw', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 400, json: async () => ({ code: 21211, message: "The 'To' number is not a valid phone number." }) })));
    const r = await sendSms('+1', 'x');
    expect(r.delivered).toBe(false);
    expect(r.error).toBe("Twilio 400 (21211): The 'To' number is not a valid phone number.");
    expect(r.id).toBeUndefined();
  });

  it('a network failure or timeout is returned, never thrown', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('The operation was aborted due to timeout'); }));
    const r = await sendSms('+1', 'x');
    expect(r).toEqual({ delivered: false, error: 'The operation was aborted due to timeout' });
    expect(error).toHaveBeenCalled();
  });

  it('a non-JSON 5xx body still yields a clear error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502, json: async () => { throw new Error('not json'); } })));
    const r = await sendSms('+1', 'x');
    expect(r).toEqual({ delivered: false, error: 'Twilio 502: request failed' });
  });

  it('cuts a body longer than SMS_MAX_BODY instead of sending three segments', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.fn(async () => ({ status: 201, json: async () => ({ sid: 'SM1' }) }));
    vi.stubGlobal('fetch', fetchSpy);
    await sendSms('+1', 'a'.repeat(SMS_MAX_BODY + 50));
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const sent = new URLSearchParams(String(init.body)).get('Body')!;
    expect(sent.length).toBe(SMS_MAX_BODY);
    expect(sent.endsWith('…')).toBe(true);
  });
});

describe('test hook', () => {
  it('a capture provider replaces the transport', async () => {
    const sent: Array<{ to: string; body: string }> = [];
    __setSmsProviderForTests({ async send(to, body) { sent.push({ to, body }); return { delivered: true, id: 'cap' }; } });
    expect(await sendSms('+15125550100', 'hello')).toEqual({ delivered: true, id: 'cap' });
    expect(sent).toEqual([{ to: '+15125550100', body: 'hello' }]);
  });
});
