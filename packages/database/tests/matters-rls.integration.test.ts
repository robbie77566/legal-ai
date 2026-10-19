/**
 * C5 — Matter rows are tenant data: invisible across tenants under withTenant
 * (hg_app), and WITH CHECK refuses a write into another tenant. Sibling of
 * organisations-rls.integration.test.ts; same two connections.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma, { withTenant, appPrisma } from '../index'

const run = `matterrls_${Date.now()}`
let tenantA: string
let tenantB: string
let orgA: string
let orgB: string
let userA: string
let userB: string
let caseA: string
let caseB: string
let matterA: string
let matterB: string

const matterData = (tenantId: string, organisationId: string, caseId: string, openedBy: string) => ({
  caseId,
  tenantId,
  organisationId,
  openedBy,
  vehicle: 'direct_appeal',
  county: 'Harris',
  clientInitials: 'AB',
})

beforeAll(async () => {
  tenantA = (await prisma.tenant.create({ data: { name: `${run}_A` } })).id
  tenantB = (await prisma.tenant.create({ data: { name: `${run}_B` } })).id
  orgA = (await prisma.organisation.create({ data: { tenantId: tenantA, kind: 'FIRM', name: `${run}_firm_A` } })).id
  orgB = (await prisma.organisation.create({ data: { tenantId: tenantB, kind: 'PD_OFFICE', name: `${run}_office_B` } })).id
  userA = (await prisma.user.create({ data: { email: `${run}_a@example.com`, tenantId: tenantA, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id
  userB = (await prisma.user.create({ data: { email: `${run}_b@example.com`, tenantId: tenantB, role: 'CLIENT', accountKind: 'PROFESSIONAL' } })).id
  caseA = (await prisma.case.create({ data: { title: `${run}_case_A`, tenantId: tenantA } })).id
  caseB = (await prisma.case.create({ data: { title: `${run}_case_B`, tenantId: tenantB } })).id
  matterA = (await prisma.matter.create({ data: matterData(tenantA, orgA, caseA, userA) })).id
  matterB = (await prisma.matter.create({ data: matterData(tenantB, orgB, caseB, userB) })).id
}, 30_000)

afterAll(async () => {
  // Cases cascade to matters; users cascade to memberships; tenants cascade to organisations.
  await prisma.case.deleteMany({ where: { title: { contains: run } } })
  await prisma.user.deleteMany({ where: { email: { contains: run } } })
  await prisma.tenant.deleteMany({ where: { name: { contains: run } } })
  await prisma.$disconnect()
  await appPrisma.$disconnect()
})

describe('Matter RLS (hg_app via withTenant)', () => {
  it('a tenant sees only its own matters', async () => {
    const rows = await withTenant(tenantA, (tx) => tx.matter.findMany({ where: { id: { in: [matterA, matterB] } } }))
    expect(rows.map((m) => m.id)).toEqual([matterA])
    const other = await withTenant(tenantA, (tx) => tx.matter.findUnique({ where: { caseId: caseB } }))
    expect(other).toBeNull()
  })

  it('no tenant context means zero rows, not all rows', async () => {
    expect(await appPrisma.matter.findMany({ where: { id: { in: [matterA, matterB] } } })).toHaveLength(0)
  })

  it('WITH CHECK blocks creating a matter for another tenant', async () => {
    const stray = (await prisma.case.create({ data: { title: `${run}_case_B2`, tenantId: tenantB } })).id
    await expect(
      withTenant(tenantA, (tx) => tx.matter.create({ data: matterData(tenantB, orgB, stray, userA) }))
    ).rejects.toThrow(/row-level security/i)
  })

  it("a tenant cannot update or delete another tenant's matter (zero rows affected)", async () => {
    const updated = await withTenant(tenantA, (tx) => tx.matter.updateMany({ where: { id: matterB }, data: { court: 'forged' } }))
    expect(updated.count).toBe(0)
    const deleted = await withTenant(tenantA, (tx) => tx.matter.deleteMany({ where: { id: matterB } }))
    expect(deleted.count).toBe(0)
    expect((await prisma.matter.findUniqueOrThrow({ where: { id: matterB } })).court).toBeNull()
  })

  it('deleting the case removes its matter (cascade) and the owner connection sees both tenants (the system surface, by design)', async () => {
    expect(await prisma.matter.count({ where: { id: { in: [matterA, matterB] } } })).toBe(2)
    const c = (await prisma.case.create({ data: { title: `${run}_case_A2`, tenantId: tenantA } })).id
    const m = (await prisma.matter.create({ data: matterData(tenantA, orgA, c, userA) })).id
    await prisma.case.delete({ where: { id: c } })
    expect(await prisma.matter.findUnique({ where: { id: m } })).toBeNull()
  })
})
