import { z } from 'zod'
import { VEHICLE_IDS, VEHICLES, type Vehicle, type ScreenId } from './trap/vehicles'
import type { TrapClockInputs } from './trap/clock'
import type { CivilDate } from './deadlines'
import { normalizeCivilDate, CIVIL_DATE_MESSAGE } from './civil-date'
import type { CaseFacts } from './facts'
import type { CaseStatus } from './machine'

/**
 * Matter intake for counsel (persona_rollout_plan.md §3 writ practitioner /
 * PD appellate attorney, §5 C). A professional opens a MATTER instead of
 * taking the family quiz; the matter is a Case the existing pipeline runs,
 * with the vehicle chosen up front and the screens weighted by it.
 *
 * Shared between the api (validation, `apps/api/src/routes/matters.ts`) and
 * the web client (`apps/web/lib/api.ts` types), so the two never drift.
 * Privacy posture (plan §3, UPL): the client is identified by INITIALS only —
 * no client name is accepted, stored or returned anywhere in this module.
 */

const CIVIL_RE = /^\d{4}-\d{2}-\d{2}$/
// Accepts what people type (9/12/2019, Sept 12 2019, blank) and stores YYYY-MM-DD.
const civilDateOpt = z.preprocess(normalizeCivilDate, z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE).optional())
// Patch flavour: null clears the date.
const civilDateNullable = z.preprocess(
  (v) => (v === null ? null : normalizeCivilDate(v)),
  z.string().regex(CIVIL_RE, CIVIL_DATE_MESSAGE).nullable().optional()
)
const shortText = (max: number) => z.string().trim().max(max)

/** Client initials: one to four letters, never a name. Stored upper-case. */
export const ClientInitialsSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{1,4}$/, 'Client initials are one to four letters — never a name')
  .transform((s) => s.toUpperCase())

export const MatterCreateSchema = z
  .object({
    vehicle: z.enum(VEHICLE_IDS),
    lane: z.enum(['TRIAL', 'PLEA']).optional(),
    county: shortText(64).min(1, 'County is required'),
    court: shortText(120).optional(),
    causeNumber: shortText(64).optional(),
    clientInitials: ClientInitialsSchema,
    offence: shortText(120).optional(),
    sentence: shortText(120).optional(),
    judgmentSignedAt: civilDateOpt,
    sentenceImposedAt: civilDateOpt,
    noticeOfAppealFiledAt: civilDateOpt,
    recordFiledAt: civilDateOpt,
    priorWrits: z.number().int().min(0).max(20).default(0),
    subsequentWrit: z.boolean().default(false),
    outsideRecordNote: shortText(2000).optional(),
    capital: z.boolean().default(false),
  })
  .strict()

/** What the web client sends (defaults optional). */
export type MatterCreateInput = z.input<typeof MatterCreateSchema>
/** What the api works with after parsing. */
export type MatterCreate = z.output<typeof MatterCreateSchema>

/**
 * The fields counsel may change after opening. Everything else (vehicle,
 * lane, county, initials, offence, sentence, prior-writ posture, capital) is
 * fixed at opening: it chose the case shape and the screen weights.
 */
export const MATTER_EDITABLE_FIELDS = [
  'judgmentSignedAt',
  'sentenceImposedAt',
  'noticeOfAppealFiledAt',
  'recordFiledAt',
  'causeNumber',
  'court',
  'outsideRecordNote',
] as const
export type MatterEditableField = (typeof MATTER_EDITABLE_FIELDS)[number]

/**
 * Of the editable fields, the two the ENGINE has consumed by the time the
 * case is past DOCS_COMPLETE: the judgment / sentencing dates feed
 * `Case.facts.judgmentDate`, `Case.deadlineFacts.judgmentDate` and
 * `Case.convictionYear`, which the deadline posture, the case summary and
 * the report read. The other dates feed only the live TRAP clock, and the
 * cause number, court and outside-record note are labels — those stay
 * editable for the life of the matter.
 */
export const MATTER_LOCKED_AFTER_DOCS_COMPLETE = ['judgmentSignedAt', 'sentenceImposedAt'] as const satisfies readonly MatterEditableField[]

/** Past DOCS_COMPLETE: the pipeline has started (or finished) with the facts as they were. */
export function matterFactsLocked(status: CaseStatus): boolean {
  return !['DRAFT', 'AWAITING_DOCS', 'DOCS_COMPLETE'].includes(status)
}

export const MatterPatchSchema = z
  .object({
    judgmentSignedAt: civilDateNullable,
    sentenceImposedAt: civilDateNullable,
    noticeOfAppealFiledAt: civilDateNullable,
    recordFiledAt: civilDateNullable,
    causeNumber: shortText(64).nullable().optional(),
    court: shortText(120).nullable().optional(),
    outsideRecordNote: shortText(2000).nullable().optional(),
  })
  .strict()

export type MatterPatchInput = z.input<typeof MatterPatchSchema>
export type MatterPatch = z.output<typeof MatterPatchSchema>

/** `${initials} — ${vehicle label}`: the case title, never a name. */
export function matterTitle(clientInitials: string, vehicle: Vehicle): string {
  return `${clientInitials.toUpperCase()} — ${VEHICLES[vehicle].label}`
}

/** The dates a matter carries, as civil dates (the api converts its DATE columns). */
export interface MatterDates {
  judgmentSignedAt?: CivilDate | null
  sentenceImposedAt?: CivilDate | null
  noticeOfAppealFiledAt?: CivilDate | null
  recordFiledAt?: CivilDate | null
}

/** The judgment date the deadline engine counts from: sentencing in open court, else the signed judgment. */
export function matterJudgmentDate(d: MatterDates): CivilDate | undefined {
  return d.sentenceImposedAt ?? d.judgmentSignedAt ?? undefined
}

export interface MatterCaseShape {
  /** Merged into `Case.facts` the way the interview merges its answers. */
  facts: CaseFacts
  /** `Case.deadlineFacts` (FR-5 engine inputs), or null when no date is known. */
  deadlineFacts: { judgmentDate: CivilDate } | null
  convictionYear?: number
  lane?: 'TRIAL' | 'PLEA'
  subsequentWrit: boolean
}

/**
 * What the matter writes onto the Case so the family-built pipeline reads
 * it unchanged ("ask once": the matter form IS the interview). A prior writ
 * — counted or flagged — puts the case in subsequent-writ mode, the §4
 * posture the checklist and the hold flag already model.
 */
export function matterCaseShape(
  m: Pick<MatterCreate, 'county' | 'lane' | 'priorWrits' | 'subsequentWrit'> & MatterDates,
  now: Date = new Date()
): MatterCaseShape {
  const judgmentDate = matterJudgmentDate(m)
  const subsequentWrit = m.subsequentWrit || m.priorWrits > 0
  const convictionYear = judgmentDate ? Number(judgmentDate.slice(0, 4)) : undefined
  const facts: CaseFacts = {
    jurisdiction: 'texas',
    capital: 'no',
    county: m.county,
    ...(convictionYear ? { convictionYear } : {}),
    ...(m.lane ? { trialOrPlea: m.lane === 'PLEA' ? 'plea' : 'trial' } : {}),
    priorWrit: subsequentWrit ? 'yes' : 'no',
    ...(judgmentDate ? { judgmentDate } : {}),
    source: { interviewAt: now.toISOString() },
  }
  return {
    facts,
    deadlineFacts: judgmentDate ? { judgmentDate } : null,
    ...(convictionYear ? { convictionYear } : {}),
    ...(m.lane ? { lane: m.lane } : {}),
    subsequentWrit,
  }
}

/** The TRAP clock inputs a matter's dates provide (clock.ts); `today` is explicit so every clock is replayable. */
export function trapInputsForMatter(m: { vehicle: Vehicle } & MatterDates, today: CivilDate): TrapClockInputs {
  return {
    vehicle: m.vehicle,
    ...(m.judgmentSignedAt ? { judgmentSignedAt: m.judgmentSignedAt } : {}),
    ...(m.sentenceImposedAt ? { sentenceImposedAt: m.sentenceImposedAt } : {}),
    ...(m.noticeOfAppealFiledAt ? { noticeOfAppealFiledAt: m.noticeOfAppealFiledAt } : {}),
    ...(m.recordFiledAt ? { recordFiledAt: m.recordFiledAt } : {}),
    today,
  }
}

/**
 * Screen weights for a vehicle (plan §5 C "screens weighted by vehicle"):
 * rank 1 is the screen the vehicle wants first (`VEHICLES[v].weightedScreens`
 * order). A screen the vehicle does not list has no weight and runs after the
 * weighted ones in the lane's usual order. No vehicle → undefined, so the
 * family path (no matter) is untouched.
 */
export function screenWeights(vehicle: Vehicle | null | undefined): Partial<Record<ScreenId, number>> | undefined {
  if (!vehicle) return undefined
  const out: Partial<Record<ScreenId, number>> = {}
  VEHICLES[vehicle].weightedScreens.forEach((id, i) => {
    out[id] = i + 1
  })
  return out
}

/** Reorders a lane's screens by the vehicle's weights; a screen without a weight keeps its lane position after the weighted ones. */
export function orderScreensByWeight<T extends string>(screens: readonly T[], weights: Partial<Record<string, number>> | undefined): T[] {
  if (!weights) return [...screens]
  const rank = (id: T) => weights[id] ?? Number.POSITIVE_INFINITY
  return screens
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((x) => x.id)
}

// ── Response shapes (what the api returns and the web client types) ──────────

export interface MatterSummary {
  matterId: string
  caseId: string
  title: string
  vehicle: Vehicle
  vehicleLabel: string
  clientInitials: string
  county: string
  causeNumber: string | null
  status: CaseStatus
  /** The record bucket (workstream B's `recordBucket`); null until the meter sets it. */
  bucket: string | null
  createdAt: string
}

export interface MatterView {
  id: string
  caseId: string
  organisationId: string
  openedBy: string
  vehicle: Vehicle
  vehicleLabel: string
  lane: 'TRIAL' | 'PLEA' | null
  county: string
  court: string | null
  causeNumber: string | null
  clientInitials: string
  offence: string | null
  sentence: string | null
  judgmentSignedAt: CivilDate | null
  sentenceImposedAt: CivilDate | null
  noticeOfAppealFiledAt: CivilDate | null
  recordFiledAt: CivilDate | null
  priorWrits: number
  subsequentWrit: boolean
  outsideRecordNote: string | null
  capital: boolean
  createdAt: string
  updatedAt: string
}
