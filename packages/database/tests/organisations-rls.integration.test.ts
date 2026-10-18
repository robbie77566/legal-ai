/**
 * A5 — Organisation and Membership rows are tenant data: invisible across
 * tenants under withTenant (hg_app), and WITH CHECK refuses a write into
 * another tenant. Sibling of rls.integration.test.ts; same two connections.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma, { withTenant, appPrisma } from '../index'

const run = `orgrls_${Date.now()}`
let tenantA: string
let tenantB: string
let orgA: string
let orgB: string
let userA: string
let userB: string

beforeAll(async () => {
  tenantA = (await prisma.tenant.create({ data: { name: `${run}_A` } })).id
  tenantB = (await prisma.tenant.create({ data: { name: `${run}_B` } })).id
  orgA = (await prisma.organisation.create({ data: { tenantId: tenantA, kind: 'FIRM', name: `${run}_firm_A` } })).id
  orgB = (await prisma.organisation.create({ data: { tenantId: tenantB, kind: 'PD_OFFICE', name: `${run}_office_B` } })).id
  userA = (await prisma.user.create({ data: { email: `${run}_a@example.com`, tenantId: tenantA, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id
  userB = (await prisma.user.create({ data: { email: `${run}_b@example.com`, tenantId: tenantB, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id
  await prisma.membership.create({ data: { organisationId: orgA, tenantId: tenantA, userId: userA, role: 'OWNER' } })
  await prisma.membership.create({ data: { organisationId: orgB, tenantId: tenantB, userId: userB, role: 'OWNER' } })
}, 30_000)

afterAll(async () => {
  // Users cascade to memberships, tenants cascade to organisations.
  await prisma.user.deleteMany({ where: { email: { contains: run } } })
  await prisma.tenant.deleteMany({ where: { name: { contains: run } } })
  await prisma.$disconnect()
  await appPrisma.$disconnect()
})

describe('Organisation / Membership RLS (hg_app via withTenant)', () => {
  it('a tenant sees only its own organisation', async () => {
    const rows = await withTenant(tenantA, (tx) => tx.organisation.findMany({ where: { name: { contains: run } } }))
    expect(rows.map((o) => o.id)).toEqual([orgA])
    const byTenant = await withTenant(tenantA, (tx) => tx.organisation.findUnique({ where: { tenantId: tenantB } }))
    expect(byTenant).toBeNull()
  })

  it('a tenant sees only its own memberships', async () => {
    const rows = await withTenant(tenantB, (tx) => tx.membership.findMany({ where: { userId: { in: [userA, userB] } } }))
    expect(rows.map((m) => m.userId)).toEqual([userB])
  })

  it('no tenant context means zero rows, not all rows', async () => {
    expect(await appPrisma.organisation.findMany({ where: { name: { contains: run } } })).toHaveLength(0)
    expect(await appPrisma.membership.findMany({ where: { userId: { in: [userA, userB] } } })).toHaveLength(0)
  })

  it('WITH CHECK blocks creating an organisation for another tenant', async () => {
    await expect(
      withTenant(tenantA, (tx) => tx.organisation.create({ data: { tenantId: tenantB, kind: 'CLINIC', name: `${run}_forged` } }))
    ).rejects.toThrow(/row-level security|unique constraint/i)
  })

  it("WITH CHECK blocks seating someone in another tenant's organisation", async () => {
    await expect(
      withTenant(tenantA, (tx) =>
        tx.membership.create({ data: { organisationId: orgB, tenantId: tenantB, userId: userA, role: 'VIEWER' } })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('the owner connection still sees both (the system surface, by design)', async () => {
    expect(await prisma.organisation.count({ where: { name: { contains: run } } })).toBe(2)
  })
})
