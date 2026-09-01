/**
 * The seven point-of-sale disclosures (landing spec §4, W-2). The copy canon
 * owns the customer-facing strings; this module owns the canonical card IDs
 * and the SET VERSION stamped into every acknowledgment — the E-6 dispute
 * archive proves exactly which disclosure set a purchaser acknowledged.
 *
 * Bump the version on ANY change to disclosure content or order (both are
 * experiment red lines — analytics plan §4.3 — so changes only arrive via
 * counsel review).
 */
export const DISCLOSURE_SET_VERSION = '2026-09-01.1' // privacy card: no-training promise removed (PO decision; counsel review pending)

export const DISCLOSURE_CARD_IDS = [
  'what_this_is_isnt', // UPL: information, not legal advice; not a law firm
  'no_outcome_promises', // DTPA-safe
  'price_and_scope', // $299 / 5,000 pages / overage terms / no A/V
  'the_clock', // SLA starts at records-complete
  'refunds', // unreadable-record policy
  'privacy_and_records', // encryption, retention, possession attestation
  'deadline_reality', // urgency without theater
] as const

export type DisclosureCardId = (typeof DISCLOSURE_CARD_IDS)[number]
