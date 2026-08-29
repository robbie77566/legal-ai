import { Prisma } from '@prisma/client'
import prisma from './index'
import {
  assertTransition,
  customerView,
  validateEventPayload,
  type CaseStatus,
  type CaseHold,
  type CaseEventType,
} from '@hg/case-lifecycle'

/**
 * The ONLY way case state changes (ENG-1 / system design §4):
 * one transaction appends the event AND updates the Case projection —
 * status, hold flags, the once-only SLA stamp. Every surface (tracker, Ops,
 * analytics) derives from the stream; the Case columns are a projection,
 * never an authority.
 *
 * Call inside `withTenant` with its `tx` — RLS then guards both the event
 * insert (denormalized tenantId, WITH CHECK) and the projection update.
 */
export interface AppendCaseEventInput {
  caseId: string
  tenantId: string
  type: CaseEventType
  version?: number
  payload: Record<string, unknown>
  actor: string // userId | "system" | worker name — never free text
  /** Status transition this event drives, validated against the machine. */
  transition?: CaseStatus
  setHold?: CaseHold
  clearHold?: CaseHold
}

const HOLD_COLUMN: Record<CaseHold, 'ocrHalt' | 'delayOurs' | 'subsequentWrit'> = {
  OCR_HALT: 'ocrHalt',
  DELAY_OURS: 'delayOurs',
  SUBSEQUENT_WRIT_MODE: 'subsequentWrit',
}

export async function appendCaseEvent(
  tx: Prisma.TransactionClient,
  input: AppendCaseEventInput
) {
  const version = input.version ?? 1
  const payload = validateEventPayload(input.type, version, input.payload)

  const caseUpdates: Record<string, unknown> = {}

  if (input.transition) {
    const current = await tx.case.findUnique({
      where: { id: input.caseId },
      select: { status: true, slaStartedAt: true },
    })
    if (!current) throw new Error(`Case ${input.caseId} not found for transition`)
    assertTransition(current.status as CaseStatus, input.transition)
    caseUpdates.status = input.transition
    // DOCS_COMPLETE stamps the SLA clock exactly once per case (US-3/ENG-1);
    // re-runs never reset it.
    if (input.transition === 'DOCS_COMPLETE' && !current.slaStartedAt) {
      caseUpdates.slaStartedAt = new Date()
    }
  }
  if (input.setHold) caseUpdates[HOLD_COLUMN[input.setHold]] = true
  if (input.clearHold) caseUpdates[HOLD_COLUMN[input.clearHold]] = false

  if (Object.keys(caseUpdates).length > 0) {
    await tx.case.update({ where: { id: input.caseId }, data: caseUpdates })
  }

  return tx.caseEvent.create({
    data: {
      caseId: input.caseId,
      tenantId: input.tenantId,
      type: input.type,
      version,
      payload: payload as Prisma.InputJsonValue,
      actor: input.actor,
    },
  })
}

/** Minimal publisher interface — satisfied by ioredis, fakeable in tests. */
export interface EventPublisher {
  publish(channel: string, message: string): Promise<unknown>
}

/**
 * Transactional-outbox tail (system design §9, implementation plan M1):
 * events are committed with `publishedAt = null`; this publisher — a system
 * process on the OWNER connection (cross-tenant by design, PII-minimal data
 * only) — claims unpublished rows with FOR UPDATE SKIP LOCKED (multi-instance
 * safe), publishes the customer-visible view to the case's Redis channel,
 * and stamps them. Crash between commit and publish loses nothing; crash
 * between publish and stamp re-publishes (at-least-once — fine for SSE).
 */
export async function publishCaseEventOutbox(
  publisher: EventPublisher,
  batchSize = 100
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      {
        id: bigint
        caseId: string
        type: string
        version: number
        payload: unknown
        createdAt: Date
        status: CaseStatus | null
        ocrHalt: boolean | null
        delayOurs: boolean | null
        subsequentWrit: boolean | null
      }[]
    >`
      SELECT e.id, e."caseId", e.type, e.version, e.payload, e."createdAt",
             c.status, c."ocrHalt", c."delayOurs", c."subsequentWrit"
      FROM "CaseEvent" e
      LEFT JOIN "Case" c ON c.id = e."caseId"
      WHERE e."publishedAt" IS NULL
      ORDER BY e.id
      LIMIT ${batchSize}
      FOR UPDATE OF e SKIP LOCKED
    `

    for (const row of rows) {
      const holds: CaseHold[] = []
      if (row.ocrHalt) holds.push('OCR_HALT')
      if (row.delayOurs) holds.push('DELAY_OURS')
      if (row.subsequentWrit) holds.push('SUBSEQUENT_WRIT_MODE')

      const message = JSON.stringify({
        type: row.type,
        version: row.version,
        caseId: row.caseId,
        at: row.createdAt.toISOString(),
        // Customer-visible mapping — the tracker renders THIS, never raw state
        customer: row.status
          ? customerView(row.status, holds)
          : null, // case hard-deleted; event survives, nothing to render
        payload: row.payload, // registry-validated: ids/enums/counts only
      })

      await publisher.publish(`case-progress:${row.caseId}`, message)
      await tx.$executeRaw`UPDATE "CaseEvent" SET "publishedAt" = now() WHERE id = ${row.id}`
    }

    return rows.length
  })
}

/**
 * Long-running outbox loop for the API process. Overlap-guarded; polls fast
 * when draining a backlog, at `idleMs` when quiet.
 */
export function startCaseEventOutbox(
  publisher: EventPublisher,
  opts: { idleMs?: number; onError?: (e: unknown) => void } = {}
): () => void {
  const idleMs = opts.idleMs ?? 1000
  let stopped = false
  let running = false

  const tick = async () => {
    if (stopped || running) return
    running = true
    try {
      const n = await publishCaseEventOutbox(publisher)
      running = false
      if (!stopped) setTimeout(tick, n > 0 ? 0 : idleMs)
    } catch (e) {
      running = false
      opts.onError?.(e)
      if (!stopped) setTimeout(tick, idleMs)
    }
  }

  void tick()
  return () => {
    stopped = true
  }
}
