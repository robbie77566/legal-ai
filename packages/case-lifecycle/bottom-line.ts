/**
 * "The bottom line" (PO, 2026-09-12; rewritten 2026-10-23, UPL review E1):
 * what the review found in this record, described, with the same next step
 * every time.
 *
 * Deterministic — computed from what the review actually found, never a
 * model opinion — so the PDF, the report page, and the attorney packet all
 * say the same thing. It DESCRIBES: how many issues were found and of what
 * kind, what the record shows for each, and what the rule says. It never
 * weighs merit, never predicts what a lawyer or a court would do, never
 * tells a family to act or to wait, and never concludes about anyone's
 * rights. Ships in both languages through the content-object pattern; the
 * parity test lives beside the bottom-line tests.
 */
import { addDays } from './deadlines'

export interface BottomLineInput {
  strong: number
  supportive: number
  background: number
  subsequentWritMode: boolean
  deadline?: {
    aedpaExpired: boolean
    daysRemaining?: number
    /** Kept for callers that still send it; the bottom line no longer speaks of urgency. */
    lachesUrgency?: boolean
    /** YYYY-MM-DD when the window is open and nothing is pending (deadlines.ts). */
    estimatedExpiryDate?: string | null
    tollingNow?: boolean
    /** YYYY-MM-DD; with `daysTolled` lets the ended-on date be counted when the window is closed. */
    finalityDate?: string | null
    daysTolled?: number
  } | null
}

export type BottomLineTier = 'strong' | 'consult' | 'limited'
export type BottomLineLang = 'en' | 'es'

export interface BottomLine {
  tier: BottomLineTier
  headline: string
  body: string[]
  /** One line for the attorney packet, in a lawyer's terms. */
  forLawyer: string
}

/** The one-year federal count (28 U.S.C. §2244(d)); mirrors deadlines.ts. */
const AEDPA_DAYS = 365

/**
 * The calendar day the one-year federal window ends, by our count. Open
 * windows carry the estimate from deadlines.ts; a closed window's end is
 * counted back from finality plus the days that were paused. Null when the
 * count is paused or the dates are missing.
 */
export function federalWindowEndDate(d: {
  expired: boolean
  tollingNow?: boolean
  estimatedExpiryDate?: string | null
  finalityDate?: string | null
  daysTolled?: number
}): string | null {
  if (d.tollingNow) return null
  if (!d.expired) return d.estimatedExpiryDate ?? null
  if (!d.finalityDate) return null
  return addDays(d.finalityDate, AEDPA_DAYS + (d.daysTolled ?? 0))
}

/**
 * Every family-facing sentence of the bottom line, both languages. `{n}`
 * placeholders are filled by `bottomLine`; plural forms are `[one, many]`.
 */
export const BOTTOM_LINE_COPY = {
  en: {
    notAdvice:
      'This is information about what is in the record, not legal advice. Only a lawyer who reviews your case can tell you whether anything can be filed.',
    issue: ['issue', 'issues'],
    more: ['more', 'more'],
    backgroundItem: ['background item', 'background items'],
    strongHeadline: 'The review found issues that stand on their own in this record.',
    strongBody:
      'This review found {strong} that stand on their own in the record, and {supportive} that add to a bigger picture. Each is quoted from the record with the page it comes from.',
    consultHeadline: 'The review found issues that add to a bigger picture, and none that stand on their own.',
    consultBody:
      'This review found {supportive} that matter together with other issues, and none that stand on their own in the record. Each is quoted from the record with the page it comes from.',
    limitedHeadline: 'The review did not find issues in this record on the questions it checks.',
    limitedBody:
      'The checks this review runs did not find issues in this record on the questions they ask. The report lists what was checked and what the record shows for each.',
    backgroundNote: 'Also listed, as context for a lawyer: {background}.',
    scope:
      'This is a reading of the court record, not a verdict on innocence or on every possible claim. Things outside the record — new evidence, a witness who changes their story, a change in the law — are not part of this review.',
    subsequent: 'A writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4.',
    windowEnded: 'Based on the dates you gave, the one-year federal window ended on {date} by our count. A lawyer must check these dates.',
    windowEndedNoDate: 'Based on the dates you gave, the one-year federal window has ended by our count. A lawyer must check these dates.',
    windowOpen: 'Based on the dates you gave, the one-year federal window is open until {date} by our count. A lawyer must check these dates.',
    windowOpenNoDate: 'Based on the dates you gave, the one-year federal window is open by our count. A lawyer must check these dates.',
    windowPaused: 'By our count, the one-year federal window is paused while the state court decides. A lawyer must check these dates.',
    closing: 'A licensed Texas attorney is the person to take this to.',
  },
  es: {
    notAdvice:
      'Esta es información sobre lo que hay en el expediente, no asesoría legal. Solo un abogado que revise su caso puede decirle si algo se puede presentar.',
    issue: ['asunto', 'asuntos'],
    more: ['más', 'más'],
    backgroundItem: ['dato de contexto', 'datos de contexto'],
    strongHeadline: 'La revisión encontró asuntos que se sostienen por sí solos en este expediente.',
    strongBody:
      'Esta revisión encontró {strong} que se sostienen por sí solos en el expediente, y {supportive} que suman a un cuadro más amplio. Cada uno se cita del expediente con la página de donde viene.',
    consultHeadline: 'La revisión encontró asuntos que suman a un cuadro más amplio, y ninguno que se sostenga por sí solo.',
    consultBody:
      'Esta revisión encontró {supportive} que importan junto con otros asuntos, y ninguno que se sostenga por sí solo en el expediente. Cada uno se cita del expediente con la página de donde viene.',
    limitedHeadline: 'La revisión no encontró asuntos en este expediente en las preguntas que revisa.',
    limitedBody:
      'Las revisiones que hacemos no encontraron asuntos en este expediente en las preguntas que hacen. El informe muestra qué se revisó y qué dice el expediente en cada punto.',
    backgroundNote: 'También se incluye, como contexto para un abogado: {background}.',
    scope:
      'Esta es una lectura del expediente judicial, no un veredicto sobre inocencia ni sobre todo reclamo posible. Lo que está fuera del expediente — evidencia nueva, un testigo que cambia su versión, un cambio en la ley — no es parte de esta revisión.',
    subsequent: 'Ya se presentó un recurso (writ) sobre esta condena. La ley de Texas limita las solicitudes posteriores; la regla es el Artículo 11.07 §4.',
    windowEnded: 'Según las fechas que usted dio, el plazo federal de un año terminó el {date} por nuestro conteo. Un abogado debe verificar estas fechas.',
    windowEndedNoDate: 'Según las fechas que usted dio, el plazo federal de un año ya terminó por nuestro conteo. Un abogado debe verificar estas fechas.',
    windowOpen: 'Según las fechas que usted dio, el plazo federal de un año está abierto hasta el {date} por nuestro conteo. Un abogado debe verificar estas fechas.',
    windowOpenNoDate: 'Según las fechas que usted dio, el plazo federal de un año está abierto por nuestro conteo. Un abogado debe verificar estas fechas.',
    windowPaused: 'Por nuestro conteo, el plazo federal de un año está en pausa mientras el tribunal estatal decide. Un abogado debe verificar estas fechas.',
    closing: 'Un abogado con licencia en Texas es la persona a quien llevar esto.',
  },
}

export const NOT_ADVICE = BOTTOM_LINE_COPY.en.notAdvice

function fill(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}

export function bottomLine(i: BottomLineInput, lang: BottomLineLang = 'en'): BottomLine {
  const c = BOTTOM_LINE_COPY[lang]
  const n = (k: number, forms: string[]) => `${k} ${k === 1 ? forms[0] : forms[1]}`
  const body: string[] = [c.notAdvice]
  let tier: BottomLineTier
  let headline: string

  if (i.strong > 0) {
    tier = 'strong'
    headline = c.strongHeadline
    body.push(fill(c.strongBody, { strong: n(i.strong, c.issue), supportive: n(i.supportive, c.more) }))
  } else if (i.supportive > 0) {
    tier = 'consult'
    headline = c.consultHeadline
    body.push(fill(c.consultBody, { supportive: n(i.supportive, c.issue) }))
  } else {
    tier = 'limited'
    headline = c.limitedHeadline
    body.push(c.limitedBody)
  }
  if (i.background > 0) body.push(fill(c.backgroundNote, { background: n(i.background, c.backgroundItem) }))
  body.push(c.scope)

  if (i.subsequentWritMode) body.push(c.subsequent)
  if (i.deadline) {
    const d = i.deadline
    const date = federalWindowEndDate({
      expired: d.aedpaExpired,
      tollingNow: d.tollingNow,
      estimatedExpiryDate: d.estimatedExpiryDate,
      finalityDate: d.finalityDate,
      daysTolled: d.daysTolled,
    })
    if (d.aedpaExpired) body.push(date ? fill(c.windowEnded, { date }) : c.windowEndedNoDate)
    else if (d.tollingNow) body.push(c.windowPaused)
    else body.push(date ? fill(c.windowOpen, { date }) : c.windowOpenNoDate)
  }
  body.push(c.closing)

  const posture = `${i.subsequentWritMode ? '; prior application reported (Art. 11.07 §4)' : ''}${i.deadline?.aedpaExpired ? '; AEDPA window estimated expired' : ''}.`
  const forLawyer =
    tier === 'strong'
      ? `Posture: ${i.strong} finding(s) rated dispositive, ${i.supportive} supportive, ${i.background} background${posture}`
      : tier === 'consult'
        ? `Posture: no dispositive finding; ${i.supportive} supportive, ${i.background} background${posture}`
        : `Posture: nothing dispositive or supportive on the record screens; ${i.background} background item(s)${posture}`

  return { tier, headline, body, forLawyer }
}
