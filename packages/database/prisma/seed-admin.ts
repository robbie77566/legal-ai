import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

/**
 * The admin bootstrap the seed runs (runbook "Admin bootstrap"): the system
 * tenant and one ADMIN account. Factored out of seed.ts so it can be tested
 * against a live database without running the whole script.
 *
 * ADMIN_BACKUP_EMAIL (your_account "Backup email (2026-10-24)"): when set,
 * the admin's backup email is stored already VERIFIED — the founder running
 * the seed is the verification. Seed-only; never a service variable. The
 * address is never printed.
 */
export interface SeedAdminEnv {
  ADMIN_EMAIL?: string
  ADMIN_PASSWORD?: string
  SYSTEM_TENANT_NAME?: string
  ADMIN_BACKUP_EMAIL?: string
}

export const DEFAULT_ADMIN_PASSWORD = 'changeme-before-production'

export async function seedAdmin(
  prisma: PrismaClient,
  env: SeedAdminEnv = process.env,
  log: (line: string) => void = console.log
): Promise<{ tenantId: string; userId: string; backupEmailSet: boolean }> {
  const systemTenantName = env.SYSTEM_TENANT_NAME || 'System Admin'
  const adminEmail = env.ADMIN_EMAIL || 'admin@legalai.local'
  const adminPassword = env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
  const backupEmail = env.ADMIN_BACKUP_EMAIL?.trim().toLowerCase() || null

  if (adminPassword === DEFAULT_ADMIN_PASSWORD) {
    console.warn('WARNING: Using default admin password. Set ADMIN_PASSWORD in .env before deploying.')
  }
  if (backupEmail && backupEmail === adminEmail.toLowerCase()) {
    throw new Error('ADMIN_BACKUP_EMAIL must differ from ADMIN_EMAIL')
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12)

  const tenant = await prisma.tenant.upsert({
    where: { id: 'system-tenant' },
    update: {},
    create: { id: 'system-tenant', name: systemTenantName },
  })

  // When ADMIN_BACKUP_EMAIL is unset the backup fields are left as they are:
  // a backup added through the account page survives a re-seed.
  const backup = backupEmail
    ? { backupEmail, backupEmailVerifiedAt: new Date(), backupEmailToken: null, backupEmailExpires: null }
    : {}
  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, role: 'ADMIN', ...backup },
    create: {
      email: adminEmail,
      name: 'System Administrator',
      role: 'ADMIN', // without this the schema default applies and /ops rejects the account
      passwordHash,
      tenantId: tenant.id,
      ...backup,
    },
  })
  if (backupEmail) log('Admin backup email set (verified).')

  return { tenantId: tenant.id, userId: user.id, backupEmailSet: !!backupEmail }
}
