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

const TRIAL_ITEMS: ChecklistTemplateItem[] = [
  { kind: 'judgment', label: 'Judgment and sentence', howToKey: 'howto.judgment' },
  { kind: 'indictment', label: 'Indictment', howToKey: 'howto.indictment' },
  { kind: 'clerks_record', label: "Clerk's record", howToKey: 'howto.clerks_record' },
  { kind: 'rr_volume', label: "Reporter's record (trial transcript) volumes", howToKey: 'howto.rr_volume' },
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
