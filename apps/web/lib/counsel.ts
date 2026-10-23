/**
 * Pure helpers for the professional surfaces (persona_rollout_plan.md §5 F):
 * the sign-up vocabulary, the professional wording of a case status, the
 * ProfessionalNav items per organisation kind and flags, and the matter
 * form's client-side validation — which IS the api's zod schema, so the two
 * can never disagree. Everything here is unit-tested without the DOM.
 */
import { MatterCreateSchema, VEHICLES, VEHICLE_IDS, type CaseStatus, type CounselVehicle, type MatterCreateInput } from '@hg/case-lifecycle'
import type { CounselSignupBody, OrganisationKind } from './api'
import type { FlagMap } from './flags'

export const PRACTICE_TYPES: ReadonlyArray<[CounselSignupBody['practiceType'], string]> = [
  ['writ', 'Writ practice (11.07 / 11.072 / 11.09 / §2254)'],
  ['appellate', 'Appellate practice'],
  ['trial', 'Trial practice'],
  ['pd', 'Public defender office'],
  ['clinic', 'Innocence or law-school clinic'],
  ['investigator', 'Investigator'],
  ['other', 'Other'],
]

/** The organisation kind a practice type implies (the api defaults to FIRM). */
export function organisationKindFor(practiceType: CounselSignupBody['practiceType']): NonNullable<CounselSignupBody['organisationKind']> {
  if (practiceType === 'pd') return 'PD_OFFICE'
  if (practiceType === 'clinic') return 'CLINIC'
  return 'FIRM'
}

export type BarVerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type LawyerSeatReason = 'NOT_PROFESSIONAL' | 'NO_SEAT' | 'LAWYER_SEAT_REQUIRED' | 'BAR_PENDING' | 'BAR_REJECTED'

/** What `/counsel/me` answers (apps/api/src/routes/counsel.ts). */
export interface CounselMe {
  user: { id: string; email: string; name: string | null; barNumber: string | null; barState: string | null; practiceType: string | null; barVerified: boolean; barVerifiedAt: string | null; barVerificationStatus: BarVerificationStatus }
  organisation: { id: string; kind: OrganisationKind | 'FAMILY'; name: string; pilot: boolean; pilotEndsAt: string | null; allowanceRecords: number; allowanceResetsAt: string | null; clinicVerified?: boolean }
  membership: { role: 'OWNER' | 'ATTORNEY' | 'INVESTIGATOR' | 'VIEWER' }
  /** The lawyer gate's answer (UPL review 2026-10-23, P1 + P2): matters, quotes, the clock and the packet open only when true. */
  lawyerSeat: boolean
  lawyerSeatReason?: LawyerSeatReason
}

/**
 * The one sentence each closed seat reads, in the places the api refuses
 * (the home banner, the matter page, the sign-up confirmation). Describes
 * the state; never a promise about the outcome.
 */
export const LAWYER_GATE_COPY: Record<LawyerSeatReason, string> = {
  BAR_PENDING: 'Your bar number is being checked by our staff; matters open once it is verified.',
  BAR_REJECTED: 'We could not verify your bar number, so counsel review is not open on this account. Reply to the email we sent and we will look again.',
  LAWYER_SEAT_REQUIRED: "The matter detail, the deadline clock, the quote and the counsel packet are for the organisation's attorneys. Your seat can upload the record and ask the Record Desk.",
  NO_SEAT: 'Your account has no seat in an organisation.',
  NOT_PROFESSIONAL: 'This is for counsel accounts.',
}
export const BAR_STATUS_LABEL: Record<BarVerificationStatus, string> = { PENDING: 'Pending verification', VERIFIED: 'Verified', REJECTED: 'Could not be verified' }
/** The sentence for a seat the gate refuses, or null when it passes. */
export function lawyerGateMessage(me: Pick<CounselMe, 'lawyerSeat' | 'lawyerSeatReason'> | null | undefined): string | null {
  if (!me || me.lawyerSeat) return null
  return LAWYER_GATE_COPY[me.lawyerSeatReason ?? 'LAWYER_SEAT_REQUIRED']
}

/**
 * A case status in professional wording (never the family's stage copy).
 * QUOTED is counsel-only (plan §5 B); the pipeline states collapse into
 * "Analysis running" because counsel does not watch a tracker.
 */
export function professionalStatus(status: CaseStatus | string): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft'
    case 'AWAITING_DOCS':
      return 'Awaiting record'
    case 'DOCS_COMPLETE':
      return 'Record complete'
    case 'QUOTED':
      return 'Quoted — awaiting acceptance'
    case 'DIGITIZING':
      return 'Reading the record'
    case 'ANALYZING':
    case 'ADJUDICATING':
      return 'Analysis running'
    case 'QA_REVIEW':
    case 'QA_REJECTED':
      return 'Quality review'
    case 'READY':
      return 'Packet ready'
    case 'DELIVERED':
      return 'Packet delivered'
    case 'REFUNDED':
      return 'Refunded'
    case 'DELETED':
      return 'Deleted'
    default:
      return String(status)
  }
}

/** Statuses from which the pipeline has started and nothing more is asked of counsel until the packet. */
export const RUNNING_STATUSES: readonly string[] = ['DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW', 'QA_REJECTED']
export const PACKET_STATUSES: readonly string[] = ['READY', 'DELIVERED']
/** Statuses in which the quote card shows (the record is metered and priced, or waiting to be). */
export const QUOTABLE_STATUSES: readonly string[] = ['DOCS_COMPLETE', 'QUOTED']

export const BUCKET_LABEL: Record<string, string> = {
  SHORT: 'Short (<100 pages)',
  STANDARD: 'Standard (100–500 pages)',
  EXTENDED: 'Extended (501–1,500 pages)',
  LONG: 'Long (>1,500 pages) — by quote',
}

export interface NavItem {
  href: string
  label: string
}

/**
 * ProfessionalNav items: Matters · Organisation · Inbox (CLINIC only, with
 * clinic_inbox on) · Record Desk (record_desk on) · Account. Never the family
 * or staff nav. `kind` null = the seat is not loaded yet.
 */
export function navItemsFor(kind: OrganisationKind | 'FAMILY' | null | undefined, flags: Pick<FlagMap, 'clinic_inbox' | 'record_desk'>): NavItem[] {
  const items: NavItem[] = [
    { href: '/counsel', label: 'Matters' },
    { href: '/counsel/org', label: 'Organisation' },
  ]
  if (kind === 'CLINIC' && flags.clinic_inbox) items.push({ href: '/counsel/inbox', label: 'Inbox' })
  if (flags.record_desk) items.push({ href: '/counsel/record-desk', label: 'Record Desk' })
  items.push({ href: '/counsel/account', label: 'Account' })
  return items
}

/** The vehicles the picker offers, in the order the plan lists them; the capital vehicle is shown refused. */
export const VEHICLE_OPTIONS: ReadonlyArray<{ id: CounselVehicle; label: string; court: string; refused: boolean; note: string }> = VEHICLE_IDS.map((id) => ({
  id,
  label: VEHICLES[id].label,
  court: VEHICLES[id].court,
  refused: VEHICLES[id].refused,
  note: VEHICLES[id].note,
}))

/** What the matter form holds before it is turned into the api body. */
export interface MatterFormState {
  vehicle: string
  lane: '' | 'TRIAL' | 'PLEA'
  county: string
  court: string
  causeNumber: string
  clientInitials: string
  offence: string
  sentence: string
  judgmentSignedAt: string
  sentenceImposedAt: string
  noticeOfAppealFiledAt: string
  recordFiledAt: string
  priorWrits: string
  subsequentWrit: boolean
  outsideRecordNote: string
  capital: boolean
}

export const EMPTY_MATTER_FORM: MatterFormState = {
  vehicle: 'direct_appeal',
  lane: '',
  county: '',
  court: '',
  causeNumber: '',
  clientInitials: '',
  offence: '',
  sentence: '',
  judgmentSignedAt: '',
  sentenceImposedAt: '',
  noticeOfAppealFiledAt: '',
  recordFiledAt: '',
  priorWrits: '0',
  subsequentWrit: false,
  outsideRecordNote: '',
  capital: false,
}

const opt = (s: string) => (s.trim() === '' ? undefined : s.trim())

/** The api body for the form state: blanks become absent, numbers become numbers. */
export function matterBodyFor(f: MatterFormState): MatterCreateInput {
  const priorWrits = Number.parseInt(f.priorWrits, 10)
  return {
    vehicle: f.vehicle as MatterCreateInput['vehicle'],
    ...(f.lane ? { lane: f.lane } : {}),
    county: f.county.trim(),
    ...(opt(f.court) ? { court: opt(f.court) } : {}),
    ...(opt(f.causeNumber) ? { causeNumber: opt(f.causeNumber) } : {}),
    clientInitials: f.clientInitials.trim(),
    ...(opt(f.offence) ? { offence: opt(f.offence) } : {}),
    ...(opt(f.sentence) ? { sentence: opt(f.sentence) } : {}),
    ...(opt(f.judgmentSignedAt) ? { judgmentSignedAt: opt(f.judgmentSignedAt) } : {}),
    ...(opt(f.sentenceImposedAt) ? { sentenceImposedAt: opt(f.sentenceImposedAt) } : {}),
    ...(opt(f.noticeOfAppealFiledAt) ? { noticeOfAppealFiledAt: opt(f.noticeOfAppealFiledAt) } : {}),
    ...(opt(f.recordFiledAt) ? { recordFiledAt: opt(f.recordFiledAt) } : {}),
    priorWrits: Number.isFinite(priorWrits) ? priorWrits : 0,
    subsequentWrit: f.subsequentWrit,
    ...(opt(f.outsideRecordNote) ? { outsideRecordNote: opt(f.outsideRecordNote) } : {}),
    capital: f.capital,
  }
}

/**
 * Client-side validation = the api's MatterCreateSchema, run in the browser
 * before the request. Returns the first message per field, keyed by the
 * form field name, or an empty map when the body would be accepted.
 */
export function validateMatterForm(f: MatterFormState): Partial<Record<keyof MatterFormState, string>> {
  const parsed = MatterCreateSchema.safeParse(matterBodyFor(f))
  if (parsed.success) return {}
  const out: Partial<Record<keyof MatterFormState, string>> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof MatterFormState | undefined
    if (!key || out[key]) continue
    out[key] = issue.code === 'invalid_enum_value' && key === 'vehicle' ? 'Choose a vehicle' : issue.message
  }
  return out
}
