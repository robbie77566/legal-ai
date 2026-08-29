/**
 * The CaseEvent registry (system design §4, §11a.5; ENG-12).
 *
 * Rules this file enforces:
 *  - PII-minimal by construction: payloads are IDs, enums, counts, and
 *    hashes. Every schema is `.strict()` — unknown keys are rejected, so
 *    document text or customer free-text can never ride along. That is what
 *    makes retaining the event skeleton past case deletion defensible.
 *  - Additive-only evolution: an event's meaning is never changed. A changed
 *    shape is a NEW `version` of the same type; old versions stay decodable.
 *  - Events are immutable and append-only (DB trigger); every projection is
 *    rebuildable from the stream.
 */
import { z } from 'zod'
import { CASE_STATUSES, CASE_HOLDS } from './machine'

const status = z.enum(CASE_STATUSES)
const hold = z.enum(CASE_HOLDS)
const id = z.string().min(1).max(64)
const count = z.number().int().nonnegative()

/** type → version → payload schema. Add new versions; never edit old ones. */
export const CASE_EVENT_SCHEMAS = {
  'case.created': {
    1: z
      .object({
        lane: z.enum(['TRIAL', 'PLEA']).optional(),
        vehicle: z.enum(['11.07', '11.071', '11.072', '11.09']).optional(),
      })
      .strict(),
  },
  'payment.succeeded': {
    1: z.object({ paymentId: id, kind: z.enum(['review', 'overage', 'rerun']) }).strict(),
  },
  'payment.refunded': {
    1: z.object({ paymentId: id, reason: z.enum(['unreadable_record', 'customer_request', 'chargeback', 'other']) }).strict(),
  },
  'interview.completed': {
    1: z.object({ checklistItemCount: count }).strict(),
  },
  'doc.uploaded': { 1: z.object({ documentId: id }).strict() },
  'doc.quarantined': { 1: z.object({ documentId: id }).strict() },
  'doc.ocr_done': {
    1: z.object({ documentId: id, pages: count, lowConfidencePages: count }).strict(),
  },
  'doc.classified': {
    1: z.object({ documentId: id, checklistItemId: id.optional() }).strict(),
  },
  'doc.confirmed': { 1: z.object({ documentId: id }).strict() },
  'doc.corrected': { 1: z.object({ documentId: id, checklistItemId: id }).strict() },
  'docs.complete': {
    1: z.object({ billablePages: count, duplicatesIgnored: count }).strict(),
  },
  'stage.entered': {
    1: z.object({ status }).strict(),
  },
  'ocr.halted': { 1: z.object({ lowConfidenceShare: z.number().min(0).max(1) }).strict() },
  'ocr.resumed': { 1: z.object({}).strict() },
  'hold.set': { 1: z.object({ hold }).strict() },
  'hold.cleared': { 1: z.object({ hold }).strict() },
  'screen.completed': {
    1: z
      .object({
        screen: z.enum([
          'preserved_error',
          'iac',
          'brady',
          'junk_science',
          'sentencing',
          'deadline',
          'appeal_restoration',
          'plea_lane',
        ]),
        // honest tracker sub-detail ("Volume 3 of 7 read") — counts only
        volumesRead: count.optional(),
        volumesTotal: count.optional(),
        pagesAnalyzed: count.optional(),
        findingCount: count,
      })
      .strict(),
  },
  'adjudication.completed': {
    1: z.object({ agreements: count, disagreements: count }).strict(),
  },
  'qa.assigned': { 1: z.object({ reviewerId: id }).strict() },
  'qa.edited': { 1: z.object({ findingId: id }).strict() },
  'qa.approved': { 1: z.object({ reportId: id }).strict() },
  'qa.rejected': { 1: z.object({ reason: z.enum(['citation_failure', 'legal_error', 'quality', 'other']) }).strict() },
  'report.rendered': { 1: z.object({ reportId: id, templateVersion: z.string().max(32) }).strict() },
  'report.delivered': { 1: z.object({ reportId: id }).strict() },
  'email.bounced': { 1: z.object({ emailKind: z.string().max(64) }).strict() },
  'delay.ours_marked': { 1: z.object({ extendedToDate: z.string().date() }).strict() },
  'delay.ours_cleared': { 1: z.object({}).strict() },
  'consent.granted': { 1: z.object({ consentId: id, recipientClass: z.enum(['clinic', 'attorney']) }).strict() },
  'consent.revoked': { 1: z.object({ consentId: id }).strict() },
  'deletion.requested': { 1: z.object({}).strict() },
  'deletion.completed': { 1: z.object({}).strict() },
  'rerun.purchased': { 1: z.object({ paymentId: id, runNo: count }).strict() },
} as const

export type CaseEventType = keyof typeof CASE_EVENT_SCHEMAS

export const CASE_EVENT_TYPES = Object.keys(CASE_EVENT_SCHEMAS) as CaseEventType[]

export class UnknownCaseEventError extends Error {
  constructor(type: string, version: number) {
    super(`Unknown case event ${type} v${version} — events are registry-defined (§11a.5)`)
    this.name = 'UnknownCaseEventError'
  }
}

/** Validate (and strip nothing — strict schemas reject) an event payload. */
export function validateEventPayload(
  type: string,
  version: number,
  payload: unknown
): Record<string, unknown> {
  const versions = (CASE_EVENT_SCHEMAS as Record<string, Record<number, z.ZodTypeAny>>)[type]
  const schema = versions?.[version]
  if (!schema) throw new UnknownCaseEventError(type, version)
  return schema.parse(payload)
}
