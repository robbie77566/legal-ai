/**
 * Per-issue weight line (PO, 2026-09-12): "it is hard to tell a major thing
 * from a minor one in the PDF." Every finding states two things a family
 * can read at a glance — what kind of issue it is (from severity) and how
 * sure the review is that it is really in the record (confidence).
 * Neither is a prediction of any outcome; the wording describes the record
 * and never weighs a claim (UPL review 2026-10-23, E1).
 */
export type IssueTone = 'urgent' | 'review' | 'muted'
export type Sureness = 'high' | 'medium' | 'low' | 'unrated'
export type WeightLang = 'en' | 'es'

export interface IssueWeight {
  /** What kind of issue this is, in the legend's words. */
  weight: string
  sureness: Sureness
  /** 0–100, or null when the finding carries no confidence. */
  percent: number | null
  tone: IssueTone
  /** Short badge for the heading, e.g. "Stands on its own". */
  badge: string
  /** The full one-line reading. */
  line: string
}

/** The legend and the weight line, both languages (parity test beside the weight tests). */
export const WEIGHT_COPY = {
  en: {
    legend: [
      { tone: 'urgent' as const, badge: 'Stands on its own', means: 'The record alone shows this issue (for example an illegal sentence, a seated biased juror, or evidence the State withheld).' },
      { tone: 'review' as const, badge: 'Adds to a bigger picture', means: 'This matters together with other issues.' },
      { tone: 'muted' as const, badge: 'Background', means: 'Context for the lawyer who reads this report.' },
    ],
    sureness:
      'How sure we are: high (80% or more), medium (55–79%), low (under 55%) — our confidence that the issue is really in the record, checked word-for-word against the pages cited. It is not a chance of winning.',
    weightLabel: 'Weight',
    sureLabel: 'How sure we are',
    notRated: 'not rated',
    bands: { high: 'high', medium: 'medium', low: 'low' },
  },
  es: {
    legend: [
      { tone: 'urgent' as const, badge: 'Se sostiene por sí solo', means: 'El expediente por sí solo muestra este asunto (por ejemplo, una sentencia ilegal, un jurado parcial que sí fue elegido, o evidencia que el Estado no entregó).' },
      { tone: 'review' as const, badge: 'Suma a un cuadro más amplio', means: 'Esto importa junto con otros asuntos.' },
      { tone: 'muted' as const, badge: 'Contexto', means: 'Contexto para el abogado que lea este informe.' },
    ],
    sureness:
      'Qué tan seguros estamos: alta (80% o más), media (55–79%), baja (menos de 55%) — nuestra confianza en que el asunto realmente está en el expediente, verificada palabra por palabra contra las páginas citadas. No es una probabilidad de ganar.',
    weightLabel: 'Peso',
    sureLabel: 'Qué tan seguros estamos',
    notRated: 'sin calificar',
    bands: { high: 'alta', medium: 'media', low: 'baja' },
  },
}

export function weightLegend(lang: WeightLang = 'en'): Array<{ tone: IssueTone; badge: string; means: string }> {
  return WEIGHT_COPY[lang].legend
}
export function surenessLegend(lang: WeightLang = 'en'): string {
  return WEIGHT_COPY[lang].sureness
}

export const WEIGHT_LEGEND: Array<{ tone: IssueTone; badge: string; means: string }> = WEIGHT_COPY.en.legend
export const SURENESS_LEGEND = WEIGHT_COPY.en.sureness

export function issueWeight(severity: string, confidence?: number | null, lang: WeightLang = 'en'): IssueWeight {
  const copy = WEIGHT_COPY[lang]
  const tone: IssueTone = severity === 'dispositive' ? 'urgent' : severity === 'supportive' ? 'review' : 'muted'
  const badge = copy.legend.find((w) => w.tone === tone)!.badge
  const weight = badge
  const c = typeof confidence === 'number' && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null
  const percent = c == null ? null : Math.round(c * 100)
  const sureness: Sureness = c == null ? 'unrated' : c >= 0.8 ? 'high' : c >= 0.55 ? 'medium' : 'low'
  const sure = sureness === 'unrated' ? copy.notRated : `${copy.bands[sureness]} (${percent}%)`
  return { weight, sureness, percent, tone, badge, line: `${copy.weightLabel}: ${weight.toLowerCase()} · ${copy.sureLabel}: ${sure}` }
}
