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

/** The no-advice line every surface carries, in one place. */
export const NOT_A_LAW_FIRM = `${BRAND.name} is operated by ${BRAND.operator}. We are not a law firm and do not provide legal advice; our reports are information about what is in a court record, prepared for you to share with a licensed attorney.`
