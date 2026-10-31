/**
 * Sign-in log and the admin's first-sign-in alert (staff_console.md §12
 * "Sign-in log and alerts", 2026-10-31).
 *
 * authorize() in auth-options.ts calls recordSignInAttempt() at every exit:
 * unknown email, no password set, wrong password, rate-limited, success.
 * Each call writes one SignInAttempt row — a system table, owner connection,
 * no RLS — and, on the FIRST successful sign-in of an account (loginCount
 * was 0), sends the admin one SMS with a link to the account in the console
 * and a short summary, plus one AuditLog row (FIRST_SIGN_IN, the userId
 * only). Nothing here ever throws: a sign-in must never fail because the
 * log or the alert did.
 *
 * What is stored: the email as typed (lower-cased), the user and tenant ids
 * when the address matched an account, the outcome, the first address in
 * x-forwarded-for (45 characters) and the user agent (256 characters). The
 * audit row never carries the IP. The SMS carries the address MASKED
 * (r•••@gmail.com), never whole.
 *
 * Flood guard: at most ALERT_MAX_PER_HOUR alert messages per rolling hour
 * per process; beyond that the attempt is still recorded and the alert is
 * logged as suppressed. ADMIN_SMS_TO unset = alerts off, attempts still
 * logged.
 */
import prisma from '@hg/database';
import { sendSms } from '@hg/sms';

export type SignInOutcome = 'SUCCESS' | 'BAD_PASSWORD' | 'UNKNOWN_EMAIL' | 'RATE_LIMITED' | 'NO_PASSWORD';

/** The slice of the User row the recorder needs — what authorize() already loaded. */
export interface SignInUser {
  id: string;
  email: string;
  name?: string | null;
  tenantId: string;
  accountKind?: 'FAMILY' | 'PROFESSIONAL' | 'STAFF' | string | null;
  loginCount?: number | null;
  createdAt?: Date | string | null;
}

export interface SignInClient {
  ip: string | null;
  userAgent: string | null;
}

export interface RecordSignInInput extends Partial<SignInClient> {
  email: string;
  user?: SignInUser | null;
  outcome: SignInOutcome;
}

export interface RecordSignInResult {
  recorded: boolean;
  firstSignIn: boolean;
  alerted: boolean;
}

export const IP_MAX_LENGTH = 45; // an IPv6 address in full
export const USER_AGENT_MAX_LENGTH = 256;
export const EMAIL_MAX_LENGTH = 254;
export const ALERT_MAX_PER_HOUR = 20;
export const FIRST_SIGN_IN_ACTION = 'FIRST_SIGN_IN'; // mirrors LogAction.FIRST_SIGN_IN in the api

const trimTo = (value: string | null | undefined, max: number): string | null => {
  if (!value) return null;
  const v = String(value).trim();
  return v ? v.slice(0, max) : null;
};

/** One header, from a plain object (NextAuth v4's `req.headers`) or a Headers-like `get()`. */
function header(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const h = headers as { get?: (n: string) => string | null | undefined } & Record<string, unknown>;
  if (typeof h.get === 'function') {
    const v = h.get(name);
    return typeof v === 'string' ? v : null;
  }
  const direct = h[name] ?? h[name.toLowerCase()] ?? Object.entries(h).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  if (Array.isArray(direct)) return typeof direct[0] === 'string' ? direct[0] : null;
  return typeof direct === 'string' ? direct : null;
}

/**
 * The caller's address and user agent from the request NextAuth hands
 * authorize(): the first x-forwarded-for address (Render's proxy appends
 * its own after the client's), else x-real-ip. Absent request = nulls.
 */
export function clientOf(req: { headers?: unknown } | null | undefined): SignInClient {
  const headers = req?.headers;
  const forwarded = header(headers, 'x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim() || header(headers, 'x-real-ip')?.trim() || null;
  return {
    ip: trimTo(first, IP_MAX_LENGTH),
    userAgent: trimTo(header(headers, 'user-agent'), USER_AGENT_MAX_LENGTH),
  };
}

/** `r•••@gmail.com` — first character, three dots, the domain (same shape as @hg/email's maskEmail). */
export function maskEmail(address: string): string {
  const at = address.indexOf('@');
  if (at <= 0) return '•••';
  return `${address[0]}•••${address.slice(at)}`;
}

const KIND_LABEL: Record<string, string> = { FAMILY: 'family', PROFESSIONAL: 'professional', STAFF: 'staff' };

const adminPanelOrigin = () => (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

const civilDate = (d: Date | string | null | undefined): string => {
  if (!d) return 'unknown';
  const date = typeof d === 'string' ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 10);
};

/**
 * The alert body, under 320 characters: who (name or "no name"), what kind
 * of account and which organisation, when it was created, the masked
 * address, and the link to the account in the console.
 */
export function buildFirstSignInSms(opts: {
  userId: string;
  name?: string | null;
  email: string;
  accountKind?: string | null;
  organisationName?: string | null;
  createdAt?: Date | string | null;
  origin?: string;
}): string {
  const kind = (opts.accountKind ?? 'FAMILY').toUpperCase();
  const label = KIND_LABEL[kind] ?? kind.toLowerCase();
  const name = (opts.name ?? '').trim().slice(0, 40) || 'no name';
  const org = (opts.organisationName ?? '').trim().slice(0, 40) || '—';
  const origin = (opts.origin ?? adminPanelOrigin()).replace(/\/+$/, '');
  return `${stagingPrefix(origin)}New sign-in: ${name} · ${label} (${kind} · ${org}) · created ${civilDate(opts.createdAt)} · ${maskEmail(opts.email)}. ${origin}/ops/accounts/${opts.userId}`;
}

/** "[staging] " when the console lives on staging.* — the same mark @hg/email puts on subjects. */
export function stagingPrefix(origin: string): string {
  try {
    return new URL(origin).hostname.startsWith('staging.') ? '[staging] ' : '';
  } catch {
    return '';
  }
}

// ── Flood guard: a rolling hour of alert timestamps, per process ────────────
let alertTimes: number[] = [];
function alertAllowed(now = Date.now()): boolean {
  alertTimes = alertTimes.filter((t) => now - t < 60 * 60 * 1000);
  if (alertTimes.length >= ALERT_MAX_PER_HOUR) return false;
  alertTimes.push(now);
  return true;
}
/** Test hook: forget the hour. */
export function __resetSignInAlertGuardForTests() {
  alertTimes = [];
}

async function organisationNameOf(tenantId: string): Promise<string | null> {
  try {
    const org = await prisma.organisation.findUnique({ where: { tenantId }, select: { name: true } });
    return org?.name ?? null;
  } catch (err) {
    console.warn('[sign-in] organisation lookup failed:', (err as Error).message);
    return null;
  }
}

/**
 * One AuditLog row for the first sign-in — the userId only, never the IP.
 * Written on the owner connection inside a transaction that sets
 * app.current_tenant_id, so the audit policy is satisfied whether or not the
 * owner is subject to RLS (the web has no hg_app credentials; withTenant is
 * the api's path).
 */
async function auditFirstSignIn(user: SignInUser): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${user.tenantId}, true)`;
    await tx.auditLog.create({
      data: { caseId: `account:${user.id}`, tenantId: user.tenantId, action: FIRST_SIGN_IN_ACTION, userId: user.id, details: { userId: user.id } },
    });
  });
}

async function alertAdmin(user: SignInUser): Promise<boolean> {
  const to = process.env.ADMIN_SMS_TO?.trim();
  if (!to) {
    console.info(`[sms] ADMIN_SMS_TO not set — first sign-in of account ${user.id} logged only`);
    return false;
  }
  if (!alertAllowed()) {
    console.warn(`[sms] alert suppressed — more than ${ALERT_MAX_PER_HOUR} first-sign-in alerts this hour (account ${user.id})`);
    return false;
  }
  const organisationName = await organisationNameOf(user.tenantId);
  const body = buildFirstSignInSms({
    userId: user.id,
    name: user.name,
    email: user.email,
    accountKind: user.accountKind,
    organisationName,
    createdAt: user.createdAt,
  });
  const result = await sendSms(to, body);
  if (!result.delivered) console.warn(`[sms] first sign-in alert for account ${user.id} not delivered: ${result.error ?? 'unknown'}`);
  return result.delivered;
}

/**
 * Record one attempt; on a first successful sign-in, audit it and alert the
 * admin. Never throws.
 */
export async function recordSignInAttempt(input: RecordSignInInput): Promise<RecordSignInResult> {
  const user = input.user ?? null;
  const firstSignIn = input.outcome === 'SUCCESS' && !!user && (user.loginCount ?? 0) === 0;
  let recorded = false;
  try {
    await prisma.signInAttempt.create({
      data: {
        email: (input.email ?? '').trim().toLowerCase().slice(0, EMAIL_MAX_LENGTH),
        userId: user?.id ?? null,
        tenantId: user?.tenantId ?? null,
        outcome: input.outcome,
        firstSignIn,
        ip: trimTo(input.ip, IP_MAX_LENGTH),
        userAgent: trimTo(input.userAgent, USER_AGENT_MAX_LENGTH),
      },
    });
    recorded = true;
  } catch (err) {
    console.error('[sign-in] could not record attempt:', (err as Error).message);
  }

  let alerted = false;
  if (firstSignIn && user) {
    try {
      await auditFirstSignIn(user);
    } catch (err) {
      console.error('[sign-in] could not audit first sign-in:', (err as Error).message);
    }
    try {
      alerted = await alertAdmin(user);
    } catch (err) {
      console.error('[sign-in] first sign-in alert failed:', (err as Error).message);
    }
  }
  return { recorded, firstSignIn, alerted };
}
