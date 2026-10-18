/**
 * Staging email guard: a database of copied accounts must not be able to
 * email a stranger, and the operator must see at a glance which deployment
 * wrote. EMAIL_ALLOWLIST drops everyone not listed; WEB_ORIGIN=https://staging.*
 * prefixes the subject. Both must change nothing when unset (production, dev).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseAllowlist, recipientAllowed, subjectPrefix, __setEmailProviderForTests, sendTestEmail, type EmailMessage } from '../index';

afterEach(() => { vi.unstubAllEnvs(); __setEmailProviderForTests(undefined); });

describe('allowlist parsing and matching', () => {
  it('unset or blank = no restriction', () => {
    expect(parseAllowlist(undefined)).toBeNull();
    expect(parseAllowlist(' , ')).toBeNull();
    expect(recipientAllowed('anyone@gmail.com', null)).toBe(true);
  });
  it('matches full addresses and @domains, case-insensitively', () => {
    const list = parseAllowlist(' @example.com, Founder@SnotNoseLegal.com ');
    expect(list).toEqual(['@example.com', 'founder@snotnoselegal.com']);
    expect(recipientAllowed('client-abc@example.com', list)).toBe(true);
    expect(recipientAllowed('founder@snotnoselegal.com', list)).toBe(true);
    expect(recipientAllowed('other@snotnoselegal.com', list)).toBe(false);
    expect(recipientAllowed('jane@gmail.com', list)).toBe(false);
    expect(recipientAllowed('jane@notexample.com', list)).toBe(false);
  });
});

describe('subject prefix', () => {
  it('"[staging] " for a staging.* web origin, nothing otherwise', () => {
    expect(subjectPrefix('https://staging.snotnoselegal.com')).toBe('[staging] ');
    expect(subjectPrefix('https://www.snotnoselegal.com,https://snotnoselegal.com')).toBe('');
    expect(subjectPrefix('http://localhost:3000')).toBe('');
    expect(subjectPrefix(undefined)).toBe('');
    expect(subjectPrefix('garbage')).toBe('');
  });
});

describe('send() under the guard', () => {
  let sent: EmailMessage[];
  beforeEach(() => {
    sent = [];
    __setEmailProviderForTests({ async send(m) { sent.push(m); return { delivered: true, id: 'x' }; } });
  });

  it('staging: drops a recipient off the list without calling the provider, and prefixes allowed mail', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', '@example.com');
    vi.stubEnv('WEB_ORIGIN', 'https://staging.snotnoselegal.com');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dropped = await sendTestEmail('jane@gmail.com');
    expect(dropped.delivered).toBe(false);
    expect(dropped.error).toMatch(/EMAIL_ALLOWLIST/);
    expect(sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledOnce();
    const ok = await sendTestEmail('client-abc@example.com');
    expect(ok.delivered).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject.startsWith('[staging] ')).toBe(true);
  });

  it('production (unset): every recipient goes through with the subject untouched', async () => {
    vi.stubEnv('EMAIL_ALLOWLIST', '');
    vi.stubEnv('WEB_ORIGIN', 'https://www.snotnoselegal.com');
    const r = await sendTestEmail('jane@gmail.com');
    expect(r.delivered).toBe(true);
    expect(sent[0].subject.startsWith('[staging]')).toBe(false);
  });
});
