'use server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@hg/auth';
import prisma from '@hg/database';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { API_URL } from '@/lib/api';

// Either the legacy single "name" field, or first/last/phone (ops /profile).
const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().trim().min(1, 'First name is required').max(60).optional(),
  lastName: z.string().trim().min(1, 'Last name is required').max(60).optional(),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === '' || /^\+?[\d\s().-]{7,}$/.test(v), 'Enter a phone number with at least 7 digits')
    .optional(),
});

export type Profile = {
  email: string; role: string; name: string | null
  firstName: string | null; lastName: string | null; phone: string | null
  passwordChangedAt: string | null; memberSince: string
  // Backup email (your_account "Backup email (2026-10-24)"): the address and
  // its state — never the token. `backupEmailAddedAt` is set only while pending.
  backupEmail: string | null; backupEmailVerifiedAt: string | null; backupEmailAddedAt: string | null
}

// The confirm link lives 24 hours (apps/api/src/routes/me.ts BACKUP_WINDOW_MS).
const BACKUP_WINDOW_MS = 24 * 3_600_000;

/** The signed-in staff member's own profile (ops /profile). */
export async function getProfile(): Promise<Profile | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true, role: true, name: true, firstName: true, lastName: true, phone: true, passwordChangedAt: true, createdAt: true,
      backupEmail: true, backupEmailVerifiedAt: true, backupEmailExpires: true,
    },
  });
  if (!u) return null;
  return {
    email: u.email, role: u.role, name: u.name, firstName: u.firstName, lastName: u.lastName, phone: u.phone,
    passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null, memberSince: u.createdAt.toISOString(),
    backupEmail: u.backupEmail,
    backupEmailVerifiedAt: u.backupEmail ? u.backupEmailVerifiedAt?.toISOString() ?? null : null,
    backupEmailAddedAt: u.backupEmail && !u.backupEmailVerifiedAt && u.backupEmailExpires
      ? new Date(u.backupEmailExpires.getTime() - BACKUP_WINDOW_MS).toISOString()
      : null,
  };
}

// ── Backup email ──────────────────────────────────────────────────────────────
// The api owns the write path (token, emails, audit); these actions call it
// with this request's session cookie, the way lib/flags.ts getFlags does.

type ApiResult = { ok: boolean; status: number; body: Record<string, unknown> };

async function apiAsUser(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<ApiResult> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const cookie = store.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: parsed };
}

const apiError = (r: ApiResult, fallback: string) =>
  r.status === 429 ? 'Too many tries in a row — wait 15 minutes and try once more.' : (typeof r.body.error === 'string' ? r.body.error : fallback);

/** POST /me/backup-email — stores the address unverified and mails the link to it. Re-posting replaces a pending address. */
export async function addBackupEmail(
  _prev: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string; backupEmail?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };
  const parsed = z.string().trim().email('Enter a valid email address').max(254).safeParse(formData.get('email'));
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  try {
    const r = await apiAsUser('/me/backup-email', 'POST', { email: parsed.data });
    if (!r.ok) return { success: false, error: apiError(r, 'Could not add the backup email') };
    return { success: true, backupEmail: String(r.body.backupEmail ?? parsed.data.toLowerCase()) };
  } catch {
    return { success: false, error: 'The service did not answer — please try again.' };
  }
}

/** Re-posts the pending address, which re-issues the link (POST /me/backup-email). */
export async function resendBackupEmailLink(): Promise<{ success: boolean; error?: string; backupEmail?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { backupEmail: true, backupEmailVerifiedAt: true } });
  if (!u?.backupEmail || u.backupEmailVerifiedAt) return { success: false, error: 'There is no pending backup email to resend to' };
  const fd = new FormData();
  fd.set('email', u.backupEmail);
  return addBackupEmail(null, fd);
}

/** DELETE /me/backup-email — clears the address, pending or verified. */
export async function removeBackupEmail(): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };
  try {
    const r = await apiAsUser('/me/backup-email', 'DELETE');
    if (!r.ok) return { success: false, error: apiError(r, 'Could not remove the backup email') };
    return { success: true };
  } catch {
    return { success: false, error: 'The service did not answer — please try again.' };
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12, 'Must be at least 12 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9!@#$%^&*()_+\-=\[\]{}|;':",.<>\/?]/, 'Must contain a number or symbol'),
});

export async function updateProfile(
  _prev: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const field = (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : undefined; };
  const parsed = updateProfileSchema.safeParse({
    name: field('name'), firstName: field('firstName'), lastName: field('lastName'), phone: field('phone'),
  });
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };
  const { name, firstName, lastName, phone } = parsed.data;
  if (!name && !firstName && !lastName) return { success: false, error: 'Nothing to save' };

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName } : {}),
      ...(phone !== undefined ? { phone: phone || null } : {}),
      // Display name follows first/last when given; the legacy form still sets it directly.
      name: firstName || lastName ? [firstName, lastName].filter(Boolean).join(' ') : name,
    },
  });

  return { success: true };
}

export async function changePassword(
  _prev: unknown,
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword'),
    newPassword: formData.get('newPassword'),
  });
  if (!parsed.success) return { success: false, error: parsed.error.errors[0].message };

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });

  if (!user?.passwordHash) return { success: false, error: 'Account has no password set' };

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { success: false, error: 'Current password is incorrect' };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: newHash, passwordChangedAt: new Date() },
  });

  // Client must call session.update({ passwordChanged: true }) after this returns
  // so the current session's JWT gets a fresh passwordAcknowledgedAt, preventing self-signout.
  return { success: true };
}
