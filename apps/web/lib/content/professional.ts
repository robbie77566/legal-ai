/**
 * Copy for the professional pages (persona_rollout_plan.md §3, §4, §5 F;
 * professional_tier_expansion.md §6.2 for the nine sections of /for-counsel).
 *
 * Voice rules (snotnoselegal_site_design.md "Professional surfaces"): plain,
 * specific, no urgency theatre, nothing addressed to a family. These pages
 * never link to /review or /check, and the family site never links here
 * except for one text link in its footer. English only — the professional
 * audience is served in English in January.
 *
 * Prices are the ADOPTED ladder (persona_rollout_plan.md §4), not the $199 of
 * the older expansion doc. Record Desk, clinic triage and investigator
 * chronology prices are unset by design until mid-December: "on request".
 */

export const FAMILY_PRICE = 299

/** The counsel ladder (plan §4). `pages` is reporter's-record pages; clerk's record and exhibits are metered separately. */
export const LADDER = [
  { rung: 'SHORT', label: 'Short', pages: 'under 100 pages', price: 149 },
  { rung: 'STANDARD', label: 'Standard', pages: '100 to 500 pages', price: 249 },
  { rung: 'EXTENDED', label: 'Extended', pages: '501 to 1,500 pages', price: 349 },
] as const

export const LONG_FROM = 499
export const RERUN_PRICE = 99
export const PACK_DISCOUNT_PERCENT = 10
export const FIRST_FREE_MAX_PAGES = 500
export const PILOT = { records: 15, days: 90 } as const
export const PUBLIC_INTEREST_RECORDS = 25
export const OFFICE_PLANS = [
  { name: 'Office 50', records: 50 },
  { name: 'Office 120', records: 120 },
  { name: 'Office 250', records: 250 },
] as const

export const SCREENS = [
  'preserved error',
  'ineffective assistance',
  'Brady',
  'junk science (Art. 11.073)',
  'sentencing',
  'identification',
  'voir dire',
] as const

/** The nine sections of /for-counsel, in the order §6.2 lists them. Headings are what the e2e spec asserts. */
export const FOR_COUNSEL = {
  hero: {
    heading: 'Every preserved objection in the record, cited to page and line, before the brief is due.',
    sub: `The habeas spine no platform sells — ineffective assistance, Brady, 11.073, sentencing, deadlines — grounded to the record. Seven screens run over the whole reporter's record: ${SCREENS.join(', ')}. Every finding carries a volume, page and line cite with the words of the record under it.`,
    ctaPrimary: `Run a Counsel Review — from $${LADDER[0].price}`,
    ctaSecondary: 'Public defender office? Start a pilot',
    micro: 'A record screen, not research. Prepared at your direction, for your use.',
  },
  packet: {
    heading: 'The packet',
    lead: 'Part B first: what the record shows, where it shows it, and what it does not. Below is one page of a Part B built from a fictional record, exactly as it renders. Every real finding is re-verified against the record text before it reaches you; a finding that fails that check is listed as dropped, not hidden.',
  },
  fit: {
    heading: 'How it fits the work',
    columns: [
      {
        title: 'Direct appeal',
        items: [
          'Preserved error, objection and ruling cited, with the harm standard each finding falls under.',
          'The TRAP clock for the matter: 26.2, 26.3, 35.2, 38.6, 49.1, 68.2 — due dates labelled jurisdictional or discretionary, proposed until you sign them.',
          'An Anders appendix: what the engine looked for and found nothing on, so the brief can say so with a cite.',
        ],
      },
      {
        title: 'Art. 11.07',
        items: [
          'Ineffective assistance, Brady and 11.073 findings on the trial record, each with the pages a claim would rest on.',
          'A prior writ declared at intake puts the matter in subsequent-application posture, so §4 is on every page.',
          'Grounds grouped to the CCA form and the affidavit list from the IAC screen arrive in February.',
        ],
      },
      {
        title: 'Federal (§2254)',
        items: [
          'AEDPA posture from the dates you give: finality, tolling, the year, and what is pausing it.',
          'An exhaustion map of which findings have been through the state courts and which have not.',
          'The same record cites, so the federal petition and the state application share one spine.',
        ],
      },
    ],
  },
  not: {
    heading: 'What it is not',
    items: [
      { title: 'Not research.', body: 'It reads one trial record. For case law, use a research platform such as vLex or Westlaw.' },
      { title: 'Not a citator.', body: 'It does not tell you whether an authority is still good law.' },
      { title: 'Not a drafting tool.', body: 'It does not write the brief or the application. It gives you the cites to write them from.' },
    ],
  },
  pricing: {
    heading: 'Pricing',
    lead: 'Priced by the length of the reporter\'s record, set by the page meter after upload and before anything runs. You see the price, then you decide.',
    note: `Short and Standard sit below the family price of $${FAMILY_PRICE} because you are the reviewer: the packet is Part B first and quality review is sampled rather than full, with every citation still re-verified. Extended is $50 above it for the pages.`,
    long: `Records over 1,500 reporter's-record pages are quoted by hand, from $${LONG_FROM}, until the volume split ships.`,
    pack: `Five-record pack, any rung: ${PACK_DISCOUNT_PERCENT}% off, good for 12 months.`,
    firstFree: `First review free up to ${FIRST_FREE_MAX_PAGES} pages with a verified Texas bar number.`,
    rerun: `Re-run with new documents: $${RERUN_PRICE}.`,
  },
  trust: {
    heading: 'Trust',
    items: [
      { title: 'Grounding is a hard filter.', body: 'Every finding is re-verified against the record text at render time. A finding that does not match the record is dropped and listed as dropped.' },
      { title: 'Your record is never training data.', body: 'Model providers are used under API terms; records are processed per page and never used to train a model.' },
      { title: 'One organisation, one tenant.', body: 'Row-level security in the database keeps every organisation\'s rows apart; a forged cross-tenant read is refused by the database itself.' },
      { title: 'Cover.', body: 'Errors-and-omissions cover is being bound before the January launch and will be named on the security page.' },
      { title: 'Deletion on request.', body: 'Case content is hard-deleted on a verified request; the payment ledger and an audit skeleton are all that remain.' },
      { title: 'Work product.', body: 'The packet is prepared at counsel\'s direction for counsel\'s use. We hold no client relationship and give no legal advice.' },
    ],
  },
  pilot: {
    heading: 'Public defender pilot',
    offer: `${PILOT.records} records, ${PILOT.days} days, free. Unlimited users; investigator and viewer seats are free after the pilot too.`,
    ask: 'The ask: two appellate attorneys run live appeals through it, thirty minutes of feedback a month, and a decision at the end of the ninety days.',
    grant: 'TIDC improvement grants reimburse up to 80% of a technology project in year one on an 80/60/40/20 taper, which gives an office a grant line to put a licence on.',
    threshold: 'Since 1 September 2025 the competitive-bidding threshold under Local Government Code §262.023 is $100,000 (SB 1173). An Office 50 licence is an ordinary departmental purchase, invoiced by ACH.',
    formLead: 'Tell us the office and the county; the founder answers in person.',
  },
  signup: {
    heading: 'Sign up',
    body: 'Email, password, your name, Texas bar number and practice type. The bar number is stored unverified and checked by a person; the first review is free once it is. The first matter form opens straight after.',
    cta: 'Create your account',
  },
  faq: {
    heading: 'Questions counsel ask',
    items: [
      { q: 'Confidentiality and privilege', a: 'The record is held in your organisation\'s tenant, encrypted in transit and at rest, and read only by the pipeline and, on a sampled basis, our quality reviewer under a confidentiality obligation. The packet is prepared at your direction for your use; nothing is shared with a family unless you share it.' },
      { q: 'Conflicts', a: 'We hold no client relationship and represent no one, so no conflict arises from reading a record. A family who buys the family review is told to take it to counsel; we never route a family away from the lawyer they have.' },
      { q: 'Aged scans', a: 'Every page goes through OCR with a confidence score per volume. A volume that reads badly stops the run before anything is charged, and you choose: a better scan, or proceed with the pages that read.' },
      { q: 'Page caps', a: `The ladder covers up to 1,500 reporter's-record pages. Longer records are quoted by hand from $${LONG_FROM} until the volume split ships in the spring. Clerk's record and exhibits are metered separately and do not move the rung.` },
      { q: 'When it finds nothing', a: 'The packet says so, screen by screen, with what was looked for and where. For a direct appeal that is the Anders appendix; for a writ it is the inventory of what the record does not show.' },
    ],
  },
} as const

export const FOR_OFFICES = {
  hero: {
    heading: 'Every preserved objection, cited, for every appeal the office carries.',
    sub: 'An organisation for the office: unlimited users, matters shared across the appellate division, and an annual allowance drawn down per record. The pilot is free.',
  },
  pilot: {
    heading: 'The pilot',
    body: `${PILOT.records} records in ${PILOT.days} days, free, for the office's appellate attorneys. No card, no contract: an organisation, a flag, and an allowance that counts down as records are run. At the end of the ninety days the office decides on the 1 October fiscal year.`,
  },
  plans: {
    heading: 'Office plans',
    lead: 'Annual, by quote, prepaid by ACH invoice with one line per matter and cause number.',
    seats: 'Unlimited users. Investigator and viewer seats are free. An attorney opens matters; an investigator files Record Desk requests; a viewer reads.',
    billing: 'ACH invoicing with a W-9 and a data-processing agreement on request. No card is needed for an office.',
  },
  security: {
    heading: 'Security',
    body: 'Row-level security per organisation, encryption in transit and at rest, ClamAV on every upload, a twelve-month retention clock, deletion on request, and a named security contact. The one-pager is written for a chief defender\'s procurement file.',
    cta: 'Read the security one-pager',
  },
  form: {
    heading: 'Start a pilot',
    lead: 'Tell us the office and the county; the founder answers in person.',
  },
} as const

export const FOR_INVESTIGATORS = {
  hero: {
    heading: 'The chronology, from the record, as a service.',
    sub: 'Membership is free inside a firm or an office. The timeline itself is delivered by the Record Desk — a person reads the volumes and builds it — until the engine reads institutional records.',
  },
  membership: {
    heading: 'Free membership',
    body: 'An investigator seat costs nothing. Your firm or office owner invites you by email; you see the organisation\'s matters read-only and the request form for a chronology or a records tracker.',
  },
  service: {
    heading: 'The chronology as a Record Desk service',
    body: 'You name the matter, the volumes and the date you need it by. The Record Desk reads the record and returns the chronology with every entry cited to volume, page and line. Prices are on request while the service is delivered by hand; nothing is charged without a quote you accept.',
    price: 'Prices on request.',
  },
  request: {
    heading: 'The request form',
    steps: [
      'Open Record Desk in your organisation and choose Chronology or Records tracker.',
      'Name the matter, the page count if you know it, and the date you need it by.',
      'Say what the chronology is for. The Record Desk answers with a quote and a delivery date; you accept or decline.',
    ],
  },
  cta: {
    heading: 'Get a seat',
    body: 'Ask your firm\'s or office\'s owner to invite you from their Organisation page. No organisation yet? A public defender office can start the free pilot below and seat its investigators on day one.',
  },
} as const

/** /for-offices/security — docs/security/security_one_pager.md as a page; the founder's bracketed review items are left out. */
export const SECURITY_PAGE = {
  title: 'Security one-pager',
  lead: 'For public defender offices and innocence clinics. Every statement describes a control as built; the data-processing agreement governs.',
  sections: [
    {
      heading: 'Who we are and what we hold',
      paras: [
        'Snot Nose Legal reads a Texas criminal trial record (reporter\'s record, clerk\'s record, exhibits) and returns a cited review. For an office or clinic we hold: the record you upload, the pages we extract from it, the findings and the report we render, and your organisation\'s members and matters. A matter is identified by county, conviction year, a short reference and client initials — never a client name.',
      ],
    },
    {
      heading: 'Hosting',
      items: [
        'Application, database and queues run on Render (US). Documents and the OCR pass live in AWS (S3, Textract), region us-east-2.',
        'The database is Postgres 16 with point-in-time recovery; backups expire after 35 days, so a deletion propagates fully within 35 days.',
        'Each environment (staging, production) has its own buckets, keys, database and email allow-list; staging never holds production data.',
      ],
    },
    {
      heading: 'Encryption',
      items: [
        'In transit: TLS everywhere — browser to site, site to API, API to AWS, Stripe, Resend and the model provider. Session cookies are Secure and HttpOnly.',
        'At rest: Postgres volumes and S3 objects are encrypted by the providers\' server-side encryption.',
        'Passwords are bcrypt (cost 12). Invitation, share-link and reset tokens are stored only as SHA-256 hashes; the raw token exists in the email or URL alone.',
      ],
    },
    {
      heading: 'Isolation between organisations',
      items: [
        'Every tenant table carries a PostgreSQL row-level-security policy on the tenant; application queries run as a database role that cannot see another tenant\'s rows, and a forged cross-tenant write is refused by the database itself.',
        'An office or clinic is one tenant. Members hold a seat with a role (owner, attorney, investigator, viewer); the read-only viewer cannot open a matter. A removed seat is refused on the very next request, not the next sign-in.',
        'A packet a family consents to share with a clinic is delivered as a reference into the clinic\'s own inbox — nothing is copied or re-uploaded — and every open re-checks that the consent is still live. Revoked consent closes the packet.',
        'Staff access is role-gated and every staff write is audit-logged with who, what and before/after.',
      ],
    },
    {
      heading: 'Malware and input handling',
      items: [
        'Every upload is scanned by ClamAV before it reaches OCR; an infected file is quarantined and never processed.',
        'Records are processed per page; nothing in a record is executed.',
      ],
    },
    {
      heading: 'Retention and deletion',
      table: [
        ['Case content (record, pages, findings, report) and identity', '12 months after delivery, or on a verified request'],
        ['Disclosure acknowledgements (what was shown, when; no case content)', '24 months'],
        ['Payment ledger (amounts, Stripe ids)', '7 years'],
        ['Event and audit skeleton (PII-minimal)', '24 months, then aggregates'],
        ['Backups', '35-day expiry'],
      ],
      paras: [
        'Deletion is scoped, not monolithic: case content is hard-deleted (database rows and S3 objects), a deletion certificate is written into the surviving event stream, and the retention rows above are all that remain. Storage moves to a cooler tier after 90 days and is deleted at 12 months.',
      ],
    },
    {
      heading: 'Sub-processors',
      table: [
        ['Render', 'Application hosting, Postgres, Redis — everything the application holds'],
        ['Amazon Web Services', 'S3 document storage, Textract OCR — uploaded records and extracted pages'],
        ['Anthropic', 'The analysis model — record text sent per screen for analysis'],
        ['Stripe', 'Payments and invoices — billing name, email, amounts; no record content'],
        ['Resend', 'Transactional email — recipient address and the email body; no record content'],
        ['Sentry', 'Error tracking — stack traces and request metadata; PII scrubbed'],
        ['PostHog', 'Product analytics — pseudonymous funnel events; no record content'],
      ],
      paras: ['A change to this list is announced to organisation owners by email before it takes effect.'],
    },
    {
      heading: 'Account security',
      items: [
        'Password rules: 12+ characters with an uppercase letter and a number or symbol; sign-in is rate-limited; resets and invitations expire.',
        'Organisation owners invite colleagues by email; invitations expire in 7 days and are single-use. SSO and MFA are not offered in January.',
      ],
    },
    {
      heading: 'Incident response',
      paras: [
        'Security issues go to the organisation\'s named security contact at Snot Nose Legal. We notify affected organisations without undue delay after confirming an incident that touches their data, and we keep the audit trail that lets us say exactly what was touched.',
      ],
    },
  ],
} as const
