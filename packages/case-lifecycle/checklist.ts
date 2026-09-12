/**
 * Interview-generated document checklists (US-2, workflow §S2).
 * The interview answers select a template; every item carries a `howToKey`
 * into the copy canon's "Don't have this? Here's how to get it" guidance.
 */

export interface ChecklistTemplateItem {
  kind: string
  label: string
  howToKey: string
}

/**
 * Document priority (PO, 2026-09-12): families rarely get every paper, and
 * both delivered reviews ran on transcripts alone. Each kind carries a tier
 * and the plain-words consequence of not having it, so the page can say
 * whether what is uploaded is enough to run — instead of a flat to-do list.
 */
export type DocTier = 'essential' | 'strengthens' | 'helpful'

export const TIER_META: Record<DocTier, { label: string; heading: string }> = {
  essential: { label: 'Essential', heading: 'Essential — the review depends on it' },
  strengthens: { label: 'Strengthens the review', heading: 'Strengthens the review' },
  helpful: { label: 'Helpful if you can get it', heading: 'Helpful if you can get it' },
}

export const DOC_PRIORITY: Record<string, { tier: DocTier; without: string }> = {
  rr_volume: {
    tier: 'essential',
    without: 'Almost every check reads the transcript — how the defense lawyer performed, what the jury heard, the science, jury selection. Without it the review can only check the paperwork.',
  },
  judgment: {
    tier: 'strengthens',
    without: 'We use it to check the sentence itself against the law and to work out your time limits. If you cannot get it, the judgment date from your answers still gives us the time limits.',
  },
  indictment: {
    tier: 'strengthens',
    without: 'It says exactly what was charged, which the sentence check and the "was the error preserved" check rely on.',
  },
  clerks_record: {
    tier: 'helpful',
    without: 'Motions, the jury charge, and rulings live here. They deepen the review; the transcript covers most of the same ground.',
  },
  appellate_opinion: {
    tier: 'helpful',
    without: 'It tells a lawyer what has already been decided. It is public — the court of appeals website usually has it.',
  },
  plea_papers: {
    tier: 'essential',
    without: 'The plea paperwork is the record of a plea case — what was admitted and what was promised. Without it there is almost nothing to review.',
  },
  admonishments: {
    tier: 'strengthens',
    without: 'Shows whether the court gave the required warnings — a key part of whether the plea was knowing and voluntary. Often inside the plea papers packet.',
  },
  judicial_confession: {
    tier: 'strengthens',
    without: 'What was admitted, in writing. Often inside the plea papers packet.',
  },
  plea_agreement: {
    tier: 'strengthens',
    without: 'What the State promised in exchange for the plea. Often inside the plea papers packet.',
  },
  prior_writ_application: {
    tier: 'essential',
    without: 'Texas strictly limits second applications. Without the earlier writ we cannot tell what is already barred.',
  },
  prior_writ_answer: {
    tier: 'essential',
    without: "The State's answer shows what was contested the first time — it shapes what a second application can raise.",
  },
  prior_writ_findings: {
    tier: 'essential',
    without: 'The findings are what the court already decided. A second application has to get past them.',
  },
}

const TIER_ORDER: Record<DocTier, number> = { essential: 0, strengthens: 1, helpful: 2 }

export function docPriority(kind: string): { tier: DocTier; without: string } {
  return DOC_PRIORITY[kind] ?? { tier: 'helpful', without: 'It adds context; the review does not depend on it.' }
}

export function tierRank(kind: string): number {
  return TIER_ORDER[docPriority(kind).tier]
}

export interface ChecklistReadiness {
  /** Every essential item has been received (or there are none). */
  enough: boolean
  essentialTotal: number
  essentialHave: number
  missing: Record<DocTier, string[]>
}

/** What is uploaded, judged by tier — the answer to "can I run it yet?". */
export function checklistReadiness(items: Array<{ kind: string; label: string; state: string }>): ChecklistReadiness {
  const missing: Record<DocTier, string[]> = { essential: [], strengthens: [], helpful: [] }
  let essentialTotal = 0
  let essentialHave = 0
  for (const i of items) {
    const { tier } = docPriority(i.kind)
    if (tier === 'essential') essentialTotal += 1
    if (i.state === 'NEEDED') missing[tier].push(i.label)
    else if (tier === 'essential') essentialHave += 1
  }
  return { enough: missing.essential.length === 0, essentialTotal, essentialHave, missing }
}

const TRIAL_ITEMS: ChecklistTemplateItem[] = [
  { kind: 'rr_volume', label: "Reporter's record (trial transcript) volumes", howToKey: 'howto.rr_volume' },
  { kind: 'judgment', label: 'Judgment and sentence', howToKey: 'howto.judgment' },
  { kind: 'indictment', label: 'Indictment', howToKey: 'howto.indictment' },
  { kind: 'clerks_record', label: "Clerk's record", howToKey: 'howto.clerks_record' },
  { kind: 'appellate_opinion', label: 'Appellate opinion (if there was an appeal)', howToKey: 'howto.appellate_opinion' },
]

const PLEA_ITEMS: ChecklistTemplateItem[] = [
  { kind: 'plea_papers', label: 'Plea papers', howToKey: 'howto.plea_papers' },
  { kind: 'admonishments', label: 'Written admonishments', howToKey: 'howto.admonishments' },
  { kind: 'judicial_confession', label: 'Judicial confession', howToKey: 'howto.judicial_confession' },
  { kind: 'plea_agreement', label: 'Plea-bargain agreement', howToKey: 'howto.plea_agreement' },
  { kind: 'judgment', label: 'Judgment and sentence', howToKey: 'howto.judgment' },
]

/** Without these the §4 subsequent-writ analysis is guesswork (workflow §S2). */
const SUBSEQUENT_WRIT_ITEMS: ChecklistTemplateItem[] = [
  { kind: 'prior_writ_application', label: 'The earlier writ application', howToKey: 'howto.prior_writ' },
  { kind: 'prior_writ_answer', label: "The State's answer to that writ", howToKey: 'howto.prior_writ' },
  { kind: 'prior_writ_findings', label: "The trial court's findings on that writ", howToKey: 'howto.prior_writ' },
]

export function checklistTemplate(opts: {
  lane: 'TRIAL' | 'PLEA'
  subsequentWrit: boolean
  hadAppeal?: boolean
}): ChecklistTemplateItem[] {
  const base = opts.lane === 'PLEA' ? [...PLEA_ITEMS] : [...TRIAL_ITEMS]
  const items = opts.hadAppeal === false
    ? base.filter((i) => i.kind !== 'appellate_opinion')
    : base
  return opts.subsequentWrit ? [...items, ...SUBSEQUENT_WRIT_ITEMS] : items
}
