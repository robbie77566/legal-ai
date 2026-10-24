/**
 * The admin bootstrap (prisma/seed-admin.ts) against live Postgres: with
 * ADMIN_BACKUP_EMAIL set the admin gets a VERIFIED backup email (the founder
 * running the seed is the verification); without it the field stays null —
 * and a backup already on the account survives a re-seed. The address is
 * never printed.
 */
import { describe, it, expect, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import prisma from '../index';
import { seedAdmin } from '../prisma/seed-admin';

const run = `seed_${Date.now()}`;
const ADMIN = `${run}_admin@example.com`;
const BACKUP = `${run}_backup@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: ADMIN } });
  await prisma.$disconnect();
});

describe('seedAdmin', () => {
  it('without ADMIN_BACKUP_EMAIL: creates the ADMIN account with no backup email', async () => {
    const lines: string[] = [];
    const out = await seedAdmin(prisma, { ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: 'SeedPassword99!!' }, (l) => lines.push(l));
    expect(out.backupEmailSet).toBe(false);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(u.role).toBe('ADMIN');
    expect(u.tenantId).toBe('system-tenant');
    expect(await bcrypt.compare('SeedPassword99!!', u.passwordHash!)).toBe(true);
    expect(u.backupEmail).toBeNull();
    expect(u.backupEmailVerifiedAt).toBeNull();
    expect(lines.join('\n')).not.toMatch(/backup/i);
  });

  it('with ADMIN_BACKUP_EMAIL: stores it lower-cased and already verified, logs that it was set, never prints it', async () => {
    const lines: string[] = [];
    const out = await seedAdmin(prisma, { ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: 'SeedPassword99!!', ADMIN_BACKUP_EMAIL: ` ${BACKUP.toUpperCase()} ` }, (l) => lines.push(l));
    expect(out.backupEmailSet).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(u.backupEmail).toBe(BACKUP);
    expect(u.backupEmailVerifiedAt).not.toBeNull();
    expect(u.backupEmailToken).toBeNull();
    expect(u.backupEmailExpires).toBeNull();
    expect(lines.some((l) => /backup email set/i.test(l))).toBe(true);
    expect(lines.join('\n')).not.toContain('@');
  });

  it('re-seeding without the variable leaves the backup in place; one equal to ADMIN_EMAIL is refused', async () => {
    await seedAdmin(prisma, { ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: 'SeedPassword99!!' }, () => {});
    const u = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    expect(u.backupEmail).toBe(BACKUP);
    expect(u.backupEmailVerifiedAt).not.toBeNull();
    await expect(seedAdmin(prisma, { ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD: 'SeedPassword99!!', ADMIN_BACKUP_EMAIL: ADMIN.toUpperCase() }, () => {})).rejects.toThrow(/must differ/);
  });
});
