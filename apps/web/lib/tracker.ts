import type { CustomerView } from '@hg/case-lifecycle'

/**
 * Tracker view-model (UI spec §5.6): the five named stages, derived purely
 * from the customer-visible mapping the outbox publishes — this module never
 * sees raw case state.
 */
export const TRACKER_STAGES = [
  { id: 'docs_received', label: 'Documents received' },
  { id: 'digitizing', label: 'Digitizing your records' },
  { id: 'analyzing', label: 'Analyzing the record' },
  { id: 'quality_review', label: 'Quality review' },
  { id: 'ready', label: 'Ready' },
] as const

export type TrackerStageId = (typeof TRACKER_STAGES)[number]['id']

export interface TrackerModel {
  stages: typeof TRACKER_STAGES
  /** −1 while awaiting documents (pre-clock), otherwise 0..4. */
  activeIndex: number
  delivered: boolean
  overlayCopy: string | null
  qualityReviewCopy: string
}

const OVERLAY_COPY: Record<NonNullable<CustomerView['overlay']>, string> = {
  needs_your_help:
    'We need your help with some pages — some scans were too hard to read. Check your email for what to do next; your review is safe.',
  delay_ours:
    "We've hit a delay on our side — your review is safe, and this delay is on us, not your clock.",
}

export function trackerModel(view: CustomerView): TrackerModel {
  const idx =
    view.stage === 'awaiting_documents'
      ? -1
      : view.stage === 'delivered'
        ? TRACKER_STAGES.length - 1
        : TRACKER_STAGES.findIndex((s) => s.id === view.stage)

  return {
    stages: TRACKER_STAGES,
    activeIndex: idx,
    delivered: view.stage === 'delivered',
    overlayCopy: view.overlay ? OVERLAY_COPY[view.overlay] : null,
    // Named role + concrete task (US-3: vague "human-reviewed" tests worse)
    qualityReviewCopy:
      'A trained legal reviewer is checking every citation in your report against your documents.',
  }
}
