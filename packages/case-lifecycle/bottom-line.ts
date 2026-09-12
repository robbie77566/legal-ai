/**
 * "The bottom line" (PO, 2026-09-12): is there enough in this record to be
 * worth a family's time and money with a post-conviction lawyer?
 *
 * Deterministic — computed from what the review actually found, never a
 * model opinion — so the PDF, the report page, and the attorney packet all
 * say the same thing. Information, not advice (the disclosures): it never
 * tells a family to file or not to file; it says what was found, what that
 * usually means for a first conversation with a lawyer, and what a lawyer
 * can see that this review cannot. Wording is in the counsel review queue.
 */
export interface BottomLineInput {
  strong: number
  supportive: number
  background: number
  subsequentWritMode: boolean
  deadline?: { aedpaExpired: boolean; daysRemaining?: number; lachesUrgency?: boolean } | null
}

export type BottomLineTier = 'strong' | 'consult' | 'limited'

export interface BottomLine {
  tier: BottomLineTier
  headline: string
  body: string[]
  /** One line for the attorney packet, in a lawyer's terms. */
  forLawyer: string
}

const NOT_ADVICE =
  'This is information about what is in the record, not legal advice. Only a lawyer who reviews your case can tell you whether anything can be filed.'

export function bottomLine(i: BottomLineInput): BottomLine {
  const n = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`
  const body: string[] = []
  let tier: BottomLineTier
  let headline: string

  if (i.strong > 0) {
    tier = 'strong'
    headline = 'There is a real reason to talk to a lawyer.'
    body.push(
      `This review found ${n(i.strong, 'issue')} that could support a claim on its own, and ${n(i.supportive, 'more')} that could strengthen one. Each is quoted from the record with the page it comes from.`,
      'In our experience, a record like this is worth putting in front of a post-conviction lawyer promptly. A first consultation costs a small fraction of a full writ, and this report is built to make that hour count — the lawyer can go straight to the pages cited instead of reading the record from the start.'
    )
  } else if (i.supportive > 0) {
    tier = 'consult'
    headline = 'Worth a consultation — nothing here stands alone yet.'
    body.push(
      `This review found ${n(i.supportive, 'possible issue')} that could strengthen a claim together, but none that would support one by itself.${i.background ? ` ${n(i.background, 'background item')} give context a lawyer should know.` : ''}`,
      'That usually means a consultation is reasonable but not urgent on the record alone: a lawyer can tell you whether these add up, and can look for what this review cannot see — new evidence, witnesses who were never called, or a change in the law. Going in with these pages already marked keeps that first conversation short.'
    )
  } else {
    tier = 'limited'
    headline = 'This review did not find a path in the record itself.'
    body.push(
      `The checks we run did not find issues in this record that, by themselves, point to a claim.${i.background ? ` ${n(i.background, 'background item')} may still be useful to a lawyer.` : ''} That is a real answer, and it saves you from paying for a full review that would likely say the same.`,
      'It is not a verdict on innocence, and it does not mean nothing can be done. A lawyer can pursue things that live outside the record — new evidence, a witness who recants, a change in the law — and this report tells them quickly what the record does and does not contain.'
    )
  }

  if (i.subsequentWritMode) {
    body.push(
      'Because a writ was already filed on this conviction, Texas sets a strict bar for another one: only a narrow set of reasons qualifies. That raises the standard for what is worth pursuing — a lawyer will need to fit any of these findings into one of those exceptions.'
    )
  }
  if (i.deadline?.aedpaExpired) {
    body.push(
      'Our estimate is that the federal one-year window has closed. Some state options may remain, and estimates can be wrong — a lawyer must check the dates before anything is decided.'
    )
  } else if (i.deadline && (i.deadline.lachesUrgency || (i.deadline.daysRemaining != null && i.deadline.daysRemaining <= 180))) {
    body.push('Time matters here: by our estimate the federal window is running. A lawyer should see this sooner rather than later.')
  }
  body.push(NOT_ADVICE)

  const forLawyer =
    tier === 'strong'
      ? `Posture: ${i.strong} finding(s) rated dispositive, ${i.supportive} supportive, ${i.background} background${i.subsequentWritMode ? '; §4 subsequent-writ bar applies' : ''}${i.deadline?.aedpaExpired ? '; AEDPA window estimated expired' : ''}.`
      : tier === 'consult'
        ? `Posture: no dispositive finding; ${i.supportive} supportive, ${i.background} background${i.subsequentWritMode ? '; §4 subsequent-writ bar applies' : ''}${i.deadline?.aedpaExpired ? '; AEDPA window estimated expired' : ''}.`
        : `Posture: nothing dispositive or supportive on the record screens; ${i.background} background item(s)${i.subsequentWritMode ? '; §4 subsequent-writ bar applies' : ''}.`

  return { tier, headline, body, forLawyer }
}
