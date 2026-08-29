/**
 * REAL RLS integration tests (implementation plan M0) — these run against a
 * live Postgres and replace the old mock-based rls.test.ts, which mocked the
 * Prisma client and therefore proved nothing about the policies.
 *
 * Two clients:
 *  - `admin`  : the migration/owner connection (superuser in dev/CI). RLS
 *               NEVER applies to superusers — a fact these tests document
 *               with a canary so nobody mistakes the bypass for isolation.
 *  - `app`    : the non-superuser `hg_app` role created by the RLS migration.
 *               This is how tenant-scoped application queries must connect;
 *               all isolation assertions run through it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, Prisma } from '@prisma/client'
import { withTenant, appPrisma } from '../index'

const ADMIN_URL =
  process.env.DATABASE_URL ??
  'postgresql://user:password@localhost:5433/legal_ai?schema=public'

const appUrl = () => {
  const u = new URL(ADMIN_URL)
  u.username = 'hg_app'
  u.password = process.env.HG_APP_PASSWORD ?? 'hg_app_dev_password'
  return u.toString()
}

const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } })
const app = new PrismaClient({ datasources: { db: { url: appUrl() } } })

/** Same semantics as packages/database withTenant, bound to the app role. */
const asTenant = async <T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> =>
  app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    return fn(tx)
  })

const run = `rls_${Date.now()}`
let tenantA: string
let tenantB: string
let caseA: string
let caseB: string

beforeAll(async () => {
  const a = await admin.tenant.create({ data: { name: `${run}_A` } })
  const b = await admin.tenant.create({ data: { name: `${run}_B` } })
  tenantA = a.id
  tenantB = b.id

  const ca = await admin.case.create({ data: { title: `${run}_case_A`, tenantId: tenantA } })
  const cb = await admin.case.create({ data: { title: `${run}_case_B`, tenantId: tenantB } })
  caseA = ca.id
  caseB = cb.id

  await admin.document.create({ data: { filename: `${run}_doc_A.pdf`, caseId: caseA } })
  await admin.document.create({ data: { filename: `${run}_doc_B.pdf`, caseId: caseB } })
  const userB = await admin.user.create({
    data: { email: `${run}_b@example.com`, tenantId: tenantB, role: 'ATTORNEY' }
  })
  await admin.caseAccess.create({ data: { caseId: caseB, userId: userB.id } })
}, 30_000)

afterAll(async () => {
  await admin.caseAccess.deleteMany({ where: { caseId: { in: [caseA, caseB] } } })
  await admin.document.deleteMany({ where: { caseId: { in: [caseA, caseB] } } })
  await admin.case.deleteMany({ where: { id: { in: [caseA, caseB] } } })
  await admin.user.deleteMany({ where: { email: { contains: run } } })
  await admin.tenant.deleteMany({ where: { name: { contains: run } } })
  await admin.$disconnect()
  await app.$disconnect()
})

describe('RLS isolation (app role, live Postgres)', () => {
  it('a tenant sees only its own cases', async () => {
    const cases = await asTenant(tenantA, (tx) =>
      tx.case.findMany({ where: { title: { contains: run } } })
    )
    expect(cases.map((c) => c.id)).toEqual([caseA])
  })

  it('no tenant context means zero rows, not all rows', async () => {
    const cases = await app.case.findMany({ where: { title: { contains: run } } })
    expect(cases).toHaveLength(0)
  })

  it('documents are scoped through their case', async () => {
    const docs = await asTenant(tenantA, (tx) =>
      tx.document.findMany({ where: { filename: { contains: run } } })
    )
    expect(docs.map((d) => d.filename)).toEqual([`${run}_doc_A.pdf`])
  })

  it('CaseAccess rows of another tenant are invisible', async () => {
    const rows = await asTenant(tenantA, (tx) =>
      tx.caseAccess.findMany({ where: { caseId: { in: [caseA, caseB] } } })
    )
    expect(rows).toHaveLength(0) // the only access row belongs to tenant B
  })

  it('WITH CHECK blocks inserting a case into another tenant', async () => {
    await expect(
      asTenant(tenantA, (tx) =>
        tx.case.create({ data: { title: `${run}_forged`, tenantId: tenantB } })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it("WITH CHECK blocks attaching a document to another tenant's case", async () => {
    await expect(
      asTenant(tenantA, (tx) =>
        tx.document.create({ data: { filename: `${run}_forged.pdf`, caseId: caseB } })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('AuditLog is append-only even for the owner connection', async () => {
    const row = await asTenant(tenantA, (tx) =>
      tx.auditLog.create({
        data: { caseId: caseA, action: 'CASE_ACCESS', userId: 'rls-test', details: {} }
      })
    )
    await expect(
      admin.auditLog.delete({ where: { id: row.id } })
    ).rejects.toThrow(/append-only/i)
  })

  it('CANARY: the superuser/owner connection bypasses RLS — which is why the app must connect as hg_app', async () => {
    const cases = await admin.case.findMany({ where: { title: { contains: run } } })
    expect(cases.length).toBe(2)
  })
})

describe('the exported withTenant (connection-role split)', () => {
  afterAll(async () => {
    await appPrisma.$disconnect()
  })

  it('runs on the hg_app role and is tenant-isolated', async () => {
    const cases = await withTenant(tenantA, (tx) =>
      tx.case.findMany({ where: { title: { contains: run } } })
    )
    expect(cases.map((c) => c.id)).toEqual([caseA])
  })

  it('enforces WITH CHECK on writes', async () => {
    await expect(
      withTenant(tenantA, (tx) =>
        tx.case.create({ data: { title: `${run}_forged2`, tenantId: tenantB } })
      )
    ).rejects.toThrow(/row-level security/i)
  })
})
