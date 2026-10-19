'use server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@hg/auth';
import prisma from '@hg/database';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

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
}

/** The signed-in staff member's own profile (ops /profile). */
export async function getProfile(): Promise<Profile | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, role: true, name: true, firstName: true, lastName: true, phone: true, passwordChangedAt: true, createdAt: true },
  });
  if (!u) return null;
  return {
    email: u.email, role: u.role, name: u.name, firstName: u.firstName, lastName: u.lastName, phone: u.phone,
    passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null, memberSince: u.createdAt.toISOString(),
  };
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
