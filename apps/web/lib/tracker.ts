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
      'A trained legal reviewer is personally checking every citation in your report against your documents — expect it within 24 hours.',
  }
}

/** What the newest pipeline event means, in the family's words (status page). */
const ACTIVITY_WORDS: Record<string, string> = {
  'doc.uploaded': 'received one of your documents',
  'zip.ingested': 'unpacked your ZIP file',
  'doc.ocr_started': 'started reading a document',
  'doc.ocr_done': 'finished reading a document',
  'doc.removed': 'removed a document at your request',
  'doc.classified': 'worked out what kind of document one of them is',
  'doc.confirmed': 'confirmed a document',
  'doc.corrected': 'updated a document label',
  'docs.complete': 'started your review',
  'stage.entered': 'moved on to the next step',
  'ocr.halted': 'paused to check reading quality',
  'ocr.resumed': 'resumed reading',
  'analysis.phase': 'started getting to know the record',
  'analysis.progress': 'started one of the checks',
  'screen.completed': 'finished one of the checks',
  'adjudication.completed': 'finished comparing results',
  'hold.set': 'sent the report for a closer look',
  'hold.cleared': 'cleared the closer look',
  'qa.approved': 'approved the report',
  'report.rendered': 'prepared your report',
  'report.delivered': 'sent your report',
  'pipeline.resumed': 'picked the work back up',
  'delay.ours_marked': 'noted a delay on our side',
  'delay.ours_cleared': 'cleared the delay',
  'rerun.purchased': 'set up a fresh review',
  'interview.completed': 'saved your answers',
  'case.created': 'set up your case',
}

export function describeActivity(type: string | null | undefined): string {
  if (!type) return 'started'
  return ACTIVITY_WORDS[type] ?? 'made progress'
}

/** The phase names in the family's words — for the activity log's check lines. */
const PHASE_ACTIVITY: Record<string, string> = {
  context: 'started getting to know the record',
  summary: 'started pulling the key facts for your report',
  batch: 'sent every check to run at once',
}

/** One activity-log line: the event plus the check or phase it names, never a count. */
export function describeActivityItem(item: { type: string; screen?: string; phase?: string }, screenNames: Record<string, string>): string {
  const name = item.screen ? screenNames[item.screen] : undefined
  if (item.type === 'screen.completed' && name) return `finished checking for ${name}`
  if (item.type === 'analysis.progress' && name) return `started checking for ${name}`
  if (item.type === 'analysis.phase' && item.phase && PHASE_ACTIVITY[item.phase]) return PHASE_ACTIVITY[item.phase]
  return describeActivity(item.type)
}

/** Finer than ago(): "8 seconds ago" — for the live signal clock. */
export function agoFine(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s} seconds ago`
  return ago(iso, now)
}

/** "just now" / "4 minutes ago" / "2 hours ago" — honest, coarse. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return ''
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`
  const h = Math.round(m / 60)
  return `${h} hour${h === 1 ? '' : 's'} ago`
}

/**
 * Render a stored civil DATE (YYYY-MM-DD, or an ISO timestamp at 00:00Z that
 * encodes one) WITHOUT timezone conversion — §11a.4. Converting to local time
 * rolled "September 21" back to "September 20" for everyone west of UTC.
 */
export function formatCivilDate(value: string | null | undefined, withYear = false): string {
  if (!value) return ''
  const civil = value.slice(0, 10)
  const d = new Date(`${civil}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}
