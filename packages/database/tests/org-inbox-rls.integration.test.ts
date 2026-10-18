/**
 * I5 — Invitation, PacketDelivery and InvestigationRequest rows are tenant
 * data (migration 20261019000034_org_inbox): invisible across tenants under
 * withTenant (hg_app), zero rows with no tenant context, and WITH CHECK
 * refuses a write into another tenant. A PacketDelivery is scoped to the
 * CLINIC's tenant, never the family's. Sibling of organisations-rls.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import prisma, { withTenant, appPrisma } from '../index'

const run = `orginboxrls_${Date.now()}`
let tenantA: string
let tenantB: string
let familyTenant: string
let orgA: string
let orgB: string
let invA: string
let delA: string
let reqA: string

beforeAll(async () => {
  tenantA = (await prisma.tenant.create({ data: { name: `${run}_A` } })).id
  tenantB = (await prisma.tenant.create({ data: { name: `${run}_B` } })).id
  familyTenant = (await prisma.tenant.create({ data: { name: `${run}_family` } })).id
  orgA = (await prisma.organisation.create({ data: { tenantId: tenantA, kind: 'CLINIC', name: `${run}_clinic_A` } })).id
  orgB = (await prisma.organisation.create({ data: { tenantId: tenantB, kind: 'PD_OFFICE', name: `${run}_office_B` } })).id
  invA = (await prisma.invitation.create({
    data: { tenantId: tenantA, organisationId: orgA, email: `${run}_a@example.com`, role: 'VIEWER', tokenHash: `${run}_hash_a`, invitedBy: 'u_a', expiresAt: new Date(Date.now() + 3_600_000) },
  })).id
  await prisma.invitation.create({
    data: { tenantId: tenantB, organisationId: orgB, email: `${run}_b@example.com`, role: 'INVESTIGATOR', tokenHash: `${run}_hash_b`, invitedBy: 'u_b', expiresAt: new Date(Date.now() + 3_600_000) },
  })
  delA = (await prisma.packetDelivery.create({
    data: { tenantId: tenantA, organisationId: orgA, sourceTenantId: familyTenant, caseId: `${run}_case`, reportId: `${run}_report`, consentGrantId: `${run}_consent` },
  })).id
  reqA = (await prisma.investigationRequest.create({
    data: { tenantId: tenantA, organisationId: orgA, requestedBy: 'u_a', kind: 'CHRONOLOGY', note: 'A' },
  })).id
  await prisma.investigationRequest.create({ data: { tenantId: tenantB, organisationId: orgB, requestedBy: 'u_b', kind: 'OTHER', note: 'B' } })
}, 30_000)

afterAll(async () => {
  // Tenants cascade to organisations, which cascade to the three tables.
  await prisma.tenant.deleteMany({ where: { name: { contains: run } } })
  await prisma.$disconnect()
  await appPrisma.$disconnect()
})

describe('Invitation / PacketDelivery / InvestigationRequest RLS (hg_app via withTenant)', () => {
  it('a tenant sees only its own invitations', async () => {
    const rows = await withTenant(tenantA, (tx) => tx.invitation.findMany({ where: { email: { contains: run } } }))
    expect(rows.map((r) => r.id)).toEqual([invA])
    expect(await withTenant(tenantB, (tx) => tx.invitation.findUnique({ where: { tokenHash: `${run}_hash_a` } }))).toBeNull()
  })

  it("a packet delivery is the clinic's row: visible to the clinic's tenant, not to the family's", async () => {
    expect((await withTenant(tenantA, (tx) => tx.packetDelivery.findMany({ where: { caseId: `${run}_case` } }))).map((r) => r.id)).toEqual([delA])
    expect(await withTenant(familyTenant, (tx) => tx.packetDelivery.findMany({ where: { caseId: `${run}_case` } }))).toEqual([])
    expect(await withTenant(tenantB, (tx) => tx.packetDelivery.findUnique({ where: { id: delA } }))).toBeNull()
  })

  it('a tenant sees only its own investigation requests', async () => {
    const rows = await withTenant(tenantA, (tx) => tx.investigationRequest.findMany({ where: { organisationId: { in: [orgA, orgB] } } }))
    expect(rows.map((r) => r.id)).toEqual([reqA])
    expect(await withTenant(tenantB, (tx) => tx.investigationRequest.findUnique({ where: { id: reqA } }))).toBeNull()
  })

  it('no tenant context means zero rows, not all rows', async () => {
    expect(await appPrisma.invitation.findMany({ where: { email: { contains: run } } })).toHaveLength(0)
    expect(await appPrisma.packetDelivery.findMany({ where: { caseId: `${run}_case` } })).toHaveLength(0)
    expect(await appPrisma.investigationRequest.findMany({ where: { organisationId: { in: [orgA, orgB] } } })).toHaveLength(0)
  })

  it('WITH CHECK blocks writing any of the three into another tenant', async () => {
    await expect(
      withTenant(tenantA, (tx) =>
        tx.invitation.create({ data: { tenantId: tenantB, organisationId: orgB, email: `${run}_forged@example.com`, role: 'VIEWER', tokenHash: `${run}_forged`, invitedBy: 'u_a', expiresAt: new Date() } })
      )
    ).rejects.toThrow(/row-level security/i)
    await expect(
      withTenant(familyTenant, (tx) =>
        tx.packetDelivery.create({ data: { tenantId: tenantB, organisationId: orgB, sourceTenantId: familyTenant, caseId: 'c', reportId: `${run}_r2`, consentGrantId: 'g' } })
      )
    ).rejects.toThrow(/row-level security/i)
    await expect(
      withTenant(tenantA, (tx) =>
        tx.investigationRequest.create({ data: { tenantId: tenantB, organisationId: orgB, requestedBy: 'u_a', kind: 'OTHER', note: 'forged' } })
      )
    ).rejects.toThrow(/row-level security/i)
    // And an UPDATE across tenants touches nothing.
    const touched = await withTenant(tenantB, (tx) => tx.investigationRequest.updateMany({ where: { id: reqA }, data: { status: 'DELIVERED' } }))
    expect(touched.count).toBe(0)
  })

  it('the owner connection still sees everything (the system surface, by design)', async () => {
    expect(await prisma.invitation.count({ where: { email: { contains: run } } })).toBe(2)
    expect(await prisma.investigationRequest.count({ where: { organisationId: { in: [orgA, orgB] } } })).toBe(2)
  })
})
