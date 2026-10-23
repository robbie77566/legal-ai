/**
 * Brand (PO, 2026-09-13): one definition for the web app, the PDF, the
 * emails and Stripe. The logo — "Snot Nose" hand-lettered in black marker,
 * "LEGAL" in a heavy serif struck through with a highlighter stroke that
 * dissolves into binary — sets the palette: ink, charcoal, highlighter
 * yellow on white. Yellow is a mark, never body text (it fails contrast on
 * white); ink carries the calls to action.
 */
export const BRAND = {
  name: 'Snot Nose Legal',
  tagline: 'Post-Conviction Case File Analytics',
  /** The thing a family buys — used where a product noun is needed. */
  product: 'case review',
  site: 'snotnoselegal.com',
  url: 'https://www.snotnoselegal.com',
  email: 'admin@snotnoselegal.com',
  operator: 'Tangent Solutions LLC',
  operatorUrl: 'https://tangentsolutionz.com',
  colors: {
    ink: '#111318',
    charcoal: '#2b2f36',
    highlight: '#e6ff3b',
    highlightSoft: '#f6ffb8',
    paper: '#ffffff',
  },
} as const

/**
 * The one statement every surface carries (UPL review 2026-10-23, rec 1):
 * the statutory words — "not a substitute for the advice of an attorney" —
 * in both languages, from this one place. Web pages render it through
 * `<NotASubstitute />`, the PDFs on the cover and in every page footer, the
 * emails in their footer. Never paraphrase it on a surface; import it.
 */
export const NOT_A_LAW_FIRM = {
  en: `${BRAND.name} is not a law firm. This is information about what is in a court record. It is not legal advice and is not a substitute for the advice of an attorney.`,
  es: `${BRAND.name} no es un bufete de abogados. Esto es información sobre lo que hay en un expediente judicial. No es consejo legal y no sustituye el consejo de un abogado.`,
} as const

/** The short form for footers and micro-trust rows; the statutory words kept. */
export const NOT_A_LAW_FIRM_SHORT = {
  en: 'Not a law firm · Not legal advice · Not a substitute for the advice of an attorney',
  es: 'No somos un bufete de abogados · No es consejo legal · No sustituye el consejo de un abogado',
} as const

/** The statutory words alone — what a test looks for on a page or a PDF. */
export const STATUTORY_WORDS = {
  en: 'not a substitute for the advice of an attorney',
  es: 'no sustituye el consejo de un abogado',
} as const

/**
 * How a report is checked, said truthfully (UPL review 2026-10-23, rec 2):
 * no "trained legal reviewer", no approval by anyone held out as a lawyer.
 * The tracker, the emails, the report footer and the share-link notice all
 * use this one sentence.
 */
export const QUALITY_CHECKED = {
  en: 'Checked by automated quality gates and by our review staff when anything looks off.',
  es: 'Revisado por controles de calidad automáticos y por nuestro personal de revisión cuando algo parece dudoso.',
} as const

/** The AI label for the report and the PDF covers (landing_page_spec.md §5 "AI disclosure"). */
export const AI_GENERATED_LABEL = {
  en: 'AI-generated content',
  es: 'Contenido generado por inteligencia artificial',
} as const

/** The State Bar of Texas Lawyer Referral & Information Service — the certified service, never the Bar homepage. */
export const LRIS_URL = 'https://www.texasbar.com/lris'

/** Beside every referral link (R-6: no consideration flows from any referral). */
export const NO_REFERRAL_FEE = {
  en: 'We receive nothing from any referral.',
  es: 'No recibimos nada por ninguna referencia.',
} as const
