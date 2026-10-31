/**
 * Staff SMS (staff_console.md §12 "Sign-in log and alerts", 2026-10-31).
 *
 * The same provider seam as `@hg/email`: Twilio when TWILIO_ACCOUNT_SID,
 * TWILIO_AUTH_TOKEN and TWILIO_FROM are all set, an honest console transport
 * otherwise (the body is printed, never silently "sent"). Twilio is called
 * over `fetch` — one form POST with HTTP basic auth — so this package adds
 * no npm dependency. Every send is wrapped: a failure is returned as
 * `{ delivered: false, error }` and never thrown into the caller, because
 * the caller is a sign-in that must not fail over an alert.
 *
 * Only staff are ever messaged from here (today: the admin's phone named by
 * ADMIN_SMS_TO). Bodies stay under SMS_MAX_BODY characters — two segments —
 * and never carry a bare email address or a password.
 */

export interface SmsResult {
  delivered: boolean;
  id?: string;
  error?: string;
}

export interface SmsProvider {
  send(to: string, body: string): Promise<SmsResult>;
}

/** Longest body we send (two GSM segments); longer bodies are cut, with a warning. */
export const SMS_MAX_BODY = 320;

/** 8s cap: a Twilio outage must not hang the sign-in that triggered the alert. */
const TWILIO_TIMEOUT_MS = 8_000;

export const twilioMessagesUrl = (accountSid: string) =>
  `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;

function twilioProvider(accountSid: string, authToken: string, from: string): SmsProvider {
  return {
    async send(to, body) {
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const form = new URLSearchParams({ To: to, From: from, Body: body });
      const res = await fetch(twilioMessagesUrl(accountSid), {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
      });
      let data: { sid?: string; message?: string; code?: number } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        // a non-JSON body (gateway page) — the status alone tells the story
      }
      if (res.status === 201 || res.status === 200) return { delivered: true, id: data.sid };
      // Twilio's error text is diagnostic ("The 'To' number is not a valid
      // phone number"), never a secret; it goes back to the log.
      return { delivered: false, error: `Twilio ${res.status}${data.code ? ` (${data.code})` : ''}: ${data.message ?? 'request failed'}` };
    },
  };
}

function consoleProvider(reason: string): SmsProvider {
  return {
    async send(to, body) {
      console.warn(`[sms] not delivered (${reason}) → ${to}\n${body}`);
      return { delivered: false, error: `${reason} — logging only` };
    },
  };
}

export function buildProvider(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const from = env.TWILIO_FROM;
  if (!sid || !token || !from) {
    const missing = [!sid && 'TWILIO_ACCOUNT_SID', !token && 'TWILIO_AUTH_TOKEN', !from && 'TWILIO_FROM'].filter(Boolean).join(', ');
    return consoleProvider(`${missing} not set on this service`);
  }
  return twilioProvider(sid, token, from);
}

let provider: SmsProvider | undefined;
function getProvider(): SmsProvider {
  if (!provider) provider = buildProvider();
  return provider;
}

/** Test hook: inject a capture provider (undefined = rebuild from env on the next send). */
export function __setSmsProviderForTests(p: SmsProvider | undefined) {
  provider = p;
}

/** Is a real transport configured? Presence only — the console tile reads this. */
export const smsConfigured = (env: NodeJS.ProcessEnv = process.env) =>
  !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

/**
 * Send one message. Never throws: a provider failure, a timeout or a bad
 * number comes back as `{ delivered: false, error }` and is logged.
 */
export async function sendSms(to: string, body: string): Promise<SmsResult> {
  let text = body;
  if (text.length > SMS_MAX_BODY) {
    console.warn(`[sms] body of ${text.length} characters cut to ${SMS_MAX_BODY}`);
    text = `${text.slice(0, SMS_MAX_BODY - 1)}…`;
  }
  try {
    return await getProvider().send(to, text);
  } catch (e) {
    const error = (e as Error).message ?? String(e);
    console.error('[sms] send failed:', error);
    return { delivered: false, error };
  }
}
