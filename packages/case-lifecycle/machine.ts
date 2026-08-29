/**
 * The canonical case state machine (ENG-1, system design §4).
 *
 * This package is the single source of truth for states, holds, legal
 * transitions, and the customer-visible stage mapping. It is deliberately
 * dependency-light (zod only) so web, API, workers, and analytics can all
 * import it. The Prisma `CaseStatus` enum must mirror `CASE_STATUSES` —
 * a database-package test asserts parity.
 */

export const CASE_STATUSES = [
  'DRAFT',
  'AWAITING_DOCS',
  'DOCS_COMPLETE',
  'DIGITIZING',
  'ANALYZING',
  'ADJUDICATING',
  'QA_REVIEW',
  'QA_REJECTED',
  'READY',
  'DELIVERED',
  'REFUNDED',
  'DELETED',
] as const

export type CaseStatus = (typeof CASE_STATUSES)[number]

/** Orthogonal hold flags — never states (ENG-1). */
export const CASE_HOLDS = ['OCR_HALT', 'DELAY_OURS', 'SUBSEQUENT_WRIT_MODE'] as const
export type CaseHold = (typeof CASE_HOLDS)[number]

export const TERMINAL_STATUSES: readonly CaseStatus[] = ['DELIVERED', 'REFUNDED', 'DELETED']

/**
 * Legal transitions. REFUNDED is reachable from any non-deleted state
 * (pre-delivery refunds via E-1/US-7; post-delivery via chargebacks).
 * DELETED is reachable from any state (verified deletion request, OPS-4).
 */
const FORWARD: Record<CaseStatus, readonly CaseStatus[]> = {
  DRAFT: ['AWAITING_DOCS'],
  AWAITING_DOCS: ['DOCS_COMPLETE'],
  DOCS_COMPLETE: ['DIGITIZING'],
  DIGITIZING: ['ANALYZING'],
  ANALYZING: ['ADJUDICATING'],
  ADJUDICATING: ['QA_REVIEW'],
  QA_REVIEW: ['QA_REJECTED', 'READY'],
  QA_REJECTED: ['ANALYZING', 'QA_REVIEW'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  REFUNDED: [],
  DELETED: [],
}

export function legalTransitions(from: CaseStatus): readonly CaseStatus[] {
  const targets = new Set<CaseStatus>(FORWARD[from])
  if (from !== 'DELETED') {
    if (from !== 'REFUNDED') targets.add('REFUNDED')
    targets.add('DELETED')
  }
  return [...targets]
}

export function isLegalTransition(from: CaseStatus, to: CaseStatus): boolean {
  return legalTransitions(from).includes(to)
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: CaseStatus,
    public readonly to: CaseStatus
  ) {
    super(
      `Illegal case transition ${from} → ${to}. This is a worker/route bug, not a data problem (ENG-1).`
    )
    this.name = 'IllegalTransitionError'
  }
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!isLegalTransition(from, to)) throw new IllegalTransitionError(from, to)
}

/**
 * Customer-visible tracker mapping (ENG-1: "a pure mapping from state+holds",
 * mirrors UI spec §5.6). Returns stable copy KEYS — the externalized copy
 * canon owns the actual strings (UXG-2).
 *
 * The five stages: awaiting_documents is pre-clock; the tracker proper is
 * docs_received → digitizing → analyzing → quality_review → ready.
 */
export type CustomerStage =
  | 'awaiting_documents'
  | 'docs_received'
  | 'digitizing'
  | 'analyzing'
  | 'quality_review'
  | 'ready'
  | 'delivered'
  | 'refunded'
  | 'deleted'

export interface CustomerView {
  stage: CustomerStage
  /** Hold overlays render on top of the stage, never replace it. */
  overlay?: 'needs_your_help' | 'delay_ours'
  subsequentWritMode: boolean
}

const STAGE_OF_STATUS: Record<CaseStatus, CustomerStage> = {
  DRAFT: 'awaiting_documents',
  AWAITING_DOCS: 'awaiting_documents',
  DOCS_COMPLETE: 'docs_received',
  DIGITIZING: 'digitizing',
  ANALYZING: 'analyzing',
  ADJUDICATING: 'analyzing', // adjudication is internal detail — customers see "analyzing"
  QA_REVIEW: 'quality_review',
  QA_REJECTED: 'quality_review', // rejection loops are internal — never customer-visible
  READY: 'ready',
  DELIVERED: 'delivered',
  REFUNDED: 'refunded',
  DELETED: 'deleted',
}

export function customerView(status: CaseStatus, holds: readonly CaseHold[]): CustomerView {
  const view: CustomerView = {
    stage: STAGE_OF_STATUS[status],
    subsequentWritMode: holds.includes('SUBSEQUENT_WRIT_MODE'),
  }
  // OCR halt outranks delay-ours: the customer can act on it.
  if (holds.includes('OCR_HALT')) view.overlay = 'needs_your_help'
  else if (holds.includes('DELAY_OURS')) view.overlay = 'delay_ours'
  return view
}
