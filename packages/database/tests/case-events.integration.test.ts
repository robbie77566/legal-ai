/**
 * Case spine integration tests (M1): event append + projection + outbox
 * against live Postgres, through the real withTenant (hg_app role).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient, $Enums } from '@prisma/client'
import { withTenant, appendCaseEvent, publishCaseEventOutbox, appPrisma } from '../index'
import { CASE_STATUSES, IllegalTransitionError } from '@hg/case-lifecycle'

const admin = new PrismaClient()
const run = `spine_${Date.now()}`
let tenantId: string
let caseId: string

beforeAll(async () => {
  const t = await admin.tenant.create({ data: { name: `${run}_T` } })
  tenantId = t.id
  const c = await admin.case.create({ data: { title: `${run}_case`, tenantId } })
  caseId = c.id
})

afterAll(async () => {
  // CaseEvent rows are append-only by design and stay behind (that IS the design).
  await admin.case.deleteMany({ where: { id: caseId } })
  await admin.tenant.deleteMany({ where: { id: tenantId } })
  await admin.$disconnect()
  await appPrisma.$disconnect()
})

describe('Prisma enum parity', () => {
  it('CaseStatus in the schema mirrors @hg/case-lifecycle exactly', () => {
    expect(Object.values($Enums.CaseStatus).sort()).toEqual([...CASE_STATUSES].sort())
  })
})

describe('appendCaseEvent (projection in the same transaction)', () => {
  it('appends and transitions DRAFT → AWAITING_DOCS', async () => {
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'interview.completed',
        payload: { checklistItemCount: 6 },
        actor: 'user_test',
        transition: 'AWAITING_DOCS',
      })
    )
    const c = await admin.case.findUniqueOrThrow({ where: { id: caseId } })
    expect(c.status).toBe('AWAITING_DOCS')
    expect(c.slaStartedAt).toBeNull()
  })

  it('rejects an illegal transition and rolls back the event', async () => {
    await expect(
      withTenant(tenantId, (tx) =>
        appendCaseEvent(tx, {
          caseId,
          tenantId,
          type: 'stage.entered',
          payload: { status: 'ANALYZING' },
          actor: 'system',
          transition: 'ANALYZING', // AWAITING_DOCS → ANALYZING skips DOCS_COMPLETE
        })
      )
    ).rejects.toThrow(IllegalTransitionError)
    const events = await withTenant(tenantId, (tx) =>
      tx.caseEvent.findMany({ where: { caseId, type: 'stage.entered' } })
    )
    expect(events).toHaveLength(0)
  })

  it('rejects payloads that violate the registry (PII guard)', async () => {
    await expect(
      withTenant(tenantId, (tx) =>
        appendCaseEvent(tx, {
          caseId,
          tenantId,
          type: 'docs.complete',
          payload: { billablePages: 10, duplicatesIgnored: 0, note: 'free text' },
          actor: 'system',
        })
      )
    ).rejects.toThrow()
  })

  it('DOCS_COMPLETE stamps the SLA clock exactly once', async () => {
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'docs.complete',
        payload: { billablePages: 42, duplicatesIgnored: 3 },
        actor: 'user_test',
        transition: 'DOCS_COMPLETE',
      })
    )
    const c = await admin.case.findUniqueOrThrow({ where: { id: caseId } })
    expect(c.status).toBe('DOCS_COMPLETE')
    expect(c.slaStartedAt).not.toBeNull()
  })

  it('hold flags set/clear without touching status', async () => {
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'hold.set',
        payload: { hold: 'OCR_HALT' },
        actor: 'system',
        setHold: 'OCR_HALT',
      })
    )
    let c = await admin.case.findUniqueOrThrow({ where: { id: caseId } })
    expect(c.ocrHalt).toBe(true)
    expect(c.status).toBe('DOCS_COMPLETE')

    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'hold.cleared',
        payload: { hold: 'OCR_HALT' },
        actor: 'system',
        clearHold: 'OCR_HALT',
      })
    )
    c = await admin.case.findUniqueOrThrow({ where: { id: caseId } })
    expect(c.ocrHalt).toBe(false)
  })

  it('events are immutable — payload rewrites are blocked even for the owner', async () => {
    const e = await admin.caseEvent.findFirstOrThrow({ where: { caseId } })
    await expect(
      admin.caseEvent.update({ where: { id: e.id }, data: { actor: 'tampered' } })
    ).rejects.toThrow(/append-only/i)
  })

  it("RLS WITH CHECK rejects an event forged into another tenant's stream", async () => {
    await expect(
      withTenant(tenantId, (tx) =>
        tx.caseEvent.create({
          data: {
            caseId,
            tenantId: 'some_other_tenant',
            type: 'hold.set',
            version: 1,
            payload: { hold: 'OCR_HALT' },
            actor: 'attacker',
          },
        })
      )
    ).rejects.toThrow(/row-level security/i)
  })
})

describe('transactional outbox', () => {
  it('publishes unpublished events with the customer-visible mapping, then stamps them', async () => {
    const published: { channel: string; message: string }[] = []
    const fake = { publish: async (channel: string, message: string) => published.push({ channel, message }) }

    const first = await publishCaseEventOutbox(fake)
    expect(first).toBeGreaterThanOrEqual(4) // the events appended above

    const mine = published.filter((p) => p.channel === `case-progress:${caseId}`)
    expect(mine.length).toBe(first)

    const docsComplete = mine.map((m) => JSON.parse(m.message)).find((m) => m.type === 'docs.complete')
    expect(docsComplete.customer.stage).toBe('docs_received')
    expect(docsComplete.payload).toEqual({ billablePages: 42, duplicatesIgnored: 3 })

    // second run: nothing left to publish
    expect(await publishCaseEventOutbox(fake)).toBe(0)
  })

  it('a publisher failure leaves events unstamped for retry (at-least-once)', async () => {
    await withTenant(tenantId, (tx) =>
      appendCaseEvent(tx, {
        caseId,
        tenantId,
        type: 'hold.set',
        payload: { hold: 'DELAY_OURS' },
        actor: 'system',
        setHold: 'DELAY_OURS',
      })
    )
    const failing = { publish: async () => { throw new Error('redis down') } }
    await expect(publishCaseEventOutbox(failing)).rejects.toThrow('redis down')

    const ok = { publish: async () => 1 }
    expect(await publishCaseEventOutbox(ok)).toBe(1)
  })
})
