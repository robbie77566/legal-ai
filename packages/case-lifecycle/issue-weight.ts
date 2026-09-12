/**
 * Per-issue weight line (PO, 2026-09-12): "it is hard to tell a major thing
 * from a minor one in the PDF." Every finding states two things a family
 * can read at a glance — how much it could matter if it holds (severity)
 * and how sure the review is that it is really in the record (confidence).
 * Neither is a prediction of any outcome; the wording is deliberate.
 */
export type IssueTone = 'urgent' | 'review' | 'muted'
export type Sureness = 'high' | 'medium' | 'low' | 'unrated'

export interface IssueWeight {
  /** What it could mean if it holds up. */
  weight: string
  sureness: Sureness
  /** 0–100, or null when the finding carries no confidence. */
  percent: number | null
  tone: IssueTone
  /** Short badge for the heading, e.g. "Could stand on its own". */
  badge: string
  /** The full one-line reading. */
  line: string
}

export const WEIGHT_LEGEND: Array<{ tone: IssueTone; badge: string; means: string }> = [
  { tone: 'urgent', badge: 'Could stand on its own', means: 'On its own this could justify relief or change the posture of the case (an illegal sentence, a seated biased juror, evidence the State withheld).' },
  { tone: 'review', badge: 'Supports a larger claim', means: 'Strengthens a claim when combined with other issues, but is unlikely to carry a filing by itself.' },
  { tone: 'muted', badge: 'Background', means: 'Context a lawyer should know; not a claim on its own.' },
]

export const SURENESS_LEGEND = 'How sure we are: high (80% or more), medium (55–79%), low (under 55%) — our confidence that the issue is really in the record, checked word-for-word against the pages cited. It is not a chance of winning.'

export function issueWeight(severity: string, confidence?: number | null): IssueWeight {
  const tone: IssueTone = severity === 'dispositive' ? 'urgent' : severity === 'supportive' ? 'review' : 'muted'
  const badge = WEIGHT_LEGEND.find((w) => w.tone === tone)!.badge
  const weight = badge
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null
  const percent = c == null ? null : Math.round(c * 100)
  const sureness: Sureness = c == null ? 'unrated' : c >= 0.8 ? 'high' : c >= 0.55 ? 'medium' : 'low'
  const sure = sureness === 'unrated' ? 'not rated' : `${sureness} (${percent}%)`
  return { weight, sureness, percent, tone, badge, line: `Weight: ${weight.toLowerCase()} · How sure we are: ${sure}` }
}
