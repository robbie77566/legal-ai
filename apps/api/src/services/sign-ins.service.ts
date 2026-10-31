import prisma, { Prisma } from '@hg/database';
import { maskEmail } from '@hg/email';

/**
 * Sign-in log and the account summary (staff_console.md §12 "Sign-in log and
 * alerts", 2026-10-31). The rows are written by the web's authorize()
 * (packages/auth/sign-in-events.ts); this is the staff console's read side
 * plus the retention sweep. SignInAttempt is a system table: owner
 * connection, no RLS, never joined into tenant data.
 */

export const SIGN_IN_RETENTION_DAYS = 180;
export const SIGN_IN_OUTCOMES = ['SUCCESS', 'BAD_PASSWORD', 'UNKNOWN_EMAIL', 'RATE_LIMITED', 'NO_PASSWORD'] as const;
export type SignInOutcome = (typeof SIGN_IN_OUTCOMES)[number];
/** The log's filter accepts every outcome plus FAILED = anything but SUCCESS. */
export const SIGN_IN_FILTERS = [...SIGN_IN_OUTCOMES, 'FAILED'] as const;
export type SignInFilter = (typeof SIGN_IN_FILTERS)[number];
export const SIGN_IN_PAGE_SIZE = 50;
export const SIGN_IN_PAGE_MAX = 200;
export const ACCOUNT_ATTEMPTS_SHOWN = 20;

/**
 * "Chrome 130 · Windows" from a full user agent — enough to tell a phone from
 * a script at a glance; the full string stays in the row. Unknown shapes are
 * cut to 60 characters rather than guessed at.
 */
export function shortUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null;
  const browsers: Array<[string, RegExp]> = [
    ['Edge', /Edg(?:e|A|iOS)?\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[.\d]* .*Safari/],
  ];
  const hit = browsers.find(([, re]) => re.test(ua));
  if (!hit) return ua.length > 60 ? `${ua.slice(0, 59)}…` : ua;
  const version = ua.match(hit[1])?.[1];
  const browser = version ? `${hit[0]} ${version}` : hit[0];
  return os ? `${browser} · ${os}` : browser;
}

const attemptView = (a: { id: string; email: string; userId: string | null; outcome: string; firstSignIn: boolean; ip: string | null; userAgent: string | null; createdAt: Date }) => ({
  id: a.id,
  email: a.email,
  userId: a.userId,
  outcome: a.outcome,
  firstSignIn: a.firstSignIn,
  ip: a.ip,
  userAgent: shortUserAgent(a.userAgent),
  createdAt: a.createdAt,
});
export type SignInAttemptView = ReturnType<typeof attemptView>;

/**
 * The account summary the SMS link lands on. Any account — family,
 * professional or staff. SUPPORT sees the backup email masked; ADMIN sees
 * the address. Null when there is no such account.
 */
export async function accountSummary(id: string, viewerRole: 'ADMIN' | 'SUPPORT' | string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, email: true, name: true, role: true, accountKind: true, tenantId: true,
      barNumber: true, barState: true, barVerificationStatus: true, barVerifiedAt: true, practiceType: true,
      createdAt: true, deletedAt: true, lastLoginAt: true, loginCount: true,
      backupEmail: true, backupEmailVerifiedAt: true,
      grants: { where: { revokedAt: null }, select: { kind: true, grantedAt: true } },
      memberships: { select: { role: true, organisation: { select: { id: true, kind: true, name: true, isTest: true } } }, take: 1, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!user) return null;
  const seat = user.memberships[0] ?? null;
  const organisation = seat?.organisation ?? (await prisma.organisation.findUnique({ where: { tenantId: user.tenantId }, select: { id: true, kind: true, name: true, isTest: true } }));
  const [cases, attempts] = await Promise.all([
    prisma.case.count({ where: { tenantId: user.tenantId, accessList: { some: { userId: user.id } } } }),
    prisma.signInAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: ACCOUNT_ATTEMPTS_SHOWN }),
  ]);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    accountKind: user.accountKind,
    role: user.role,
    grants: user.grants.map((g) => g.kind),
    seat: seat?.role ?? null,
    organisation: organisation ? { id: organisation.id, kind: organisation.kind, name: organisation.name, isTest: organisation.isTest } : null,
    bar: user.accountKind === 'PROFESSIONAL'
      ? { number: user.barNumber, state: user.barState, status: user.barVerificationStatus, verifiedAt: user.barVerifiedAt, practiceType: user.practiceType }
      : null,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
    lastSignInAt: user.lastLoginAt,
    signInCount: user.loginCount,
    cases,
    backupEmail: user.backupEmail
      ? { address: viewerRole === 'ADMIN' ? user.backupEmail : maskEmail(user.backupEmail), verified: !!user.backupEmailVerifiedAt, verifiedAt: user.backupEmailVerifiedAt }
      : null,
    attempts: attempts.map(attemptView),
  };
}
export type AccountSummary = NonNullable<Awaited<ReturnType<typeof accountSummary>>>;

export interface ListSignInsParams {
  outcome?: SignInFilter;
  since?: Date;
  q?: string;
  first?: boolean;
  page?: number;
  pageSize?: number;
}

/** The log, newest first, paged. */
export async function listSignIns(params: ListSignInsParams = {}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize ?? SIGN_IN_PAGE_SIZE)), SIGN_IN_PAGE_MAX);
  const where: Prisma.SignInAttemptWhereInput = {};
  if (params.outcome === 'FAILED') where.outcome = { not: 'SUCCESS' };
  else if (params.outcome) where.outcome = params.outcome;
  if (params.since) where.createdAt = { gte: params.since };
  if (params.q) where.email = { contains: params.q, mode: 'insensitive' };
  if (params.first) where.firstSignIn = true;
  const [rows, total] = await Promise.all([
    prisma.signInAttempt.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.signInAttempt.count({ where }),
  ]);
  return { attempts: rows.map(attemptView), page, pageSize, total, hasMore: page * pageSize < total };
}

/** Midnight today in America/Chicago, as a UTC instant — the staff side's civil day. */
export function startOfTodayChicago(now = new Date()): Date {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
  const offsetMs = now.getTime() - local.getTime();
  local.setHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMs);
}

/** The Today page's two numbers. */
export async function signInCounts(now = new Date()) {
  const [firstToday, failed24h] = await Promise.all([
    prisma.signInAttempt.count({ where: { firstSignIn: true, createdAt: { gte: startOfTodayChicago(now) } } }),
    prisma.signInAttempt.count({ where: { outcome: { not: 'SUCCESS' }, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
  ]);
  return { firstToday, failed24h };
}

/** Retention: rows older than SIGN_IN_RETENTION_DAYS go. Called hourly from apps/api/src/index.ts and from POST /ops/sign-ins/prune. */
export async function pruneSignInAttempts(now = new Date()) {
  const cutoff = new Date(now.getTime() - SIGN_IN_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.signInAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { deleted: count, cutoff };
}
