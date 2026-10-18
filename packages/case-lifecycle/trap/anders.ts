/**
 * The Anders appendix as data: the items a Texas Anders brief and its
 * accompanying duties must address, each mapped to the screens whose
 * findings the report lays against it.
 *
 * Sources, as recalled (confidence: proposed until an appellate lawyer
 * signs the list — README.md):
 *  - Anders v. California, 386 U.S. 738 (1967): counsel who finds the
 *    appeal wholly frivolous files a brief "referring to anything in the
 *    record that might arguably support the appeal" and moves to withdraw.
 *  - High v. State, 573 S.W.2d 807 (Tex. Crim. App. 1978): a professional
 *    evaluation of the record with record references and authorities
 *    showing why there are no arguable grounds.
 *  - Kelly v. State, 436 S.W.3d 313 (Tex. Crim. App. 2014): counsel's
 *    duties to the client — copy of the brief and motion, notice of the
 *    right to review the record and file a pro se response, a form motion
 *    for access to the record, and the right to seek discretionary review;
 *    certification to the court.
 *  - In re Schulman, 252 S.W.3d 403 (Tex. Crim. App. 2008); Bledsoe v.
 *    State, 178 S.W.3d 824 (Tex. Crim. App. 2005): the court of appeals'
 *    own review; counsel does not re-brief after an Anders affirmance.
 *  - Texas State Bar, Performance Guidelines for Non-Capital Criminal
 *    Defense Representation, Guideline 9.5 (2011): (F) review the record
 *    for completeness and accuracy; (G) "fully review the appellate record
 *    for all reviewable errors" — the plan cites 9.5 for this appendix.
 *    Sub-lettering of 9.5 beyond (F) and (G) is uncertain here.
 *
 * The appendix is a record of PROCESS supporting counsel's own reading of
 * the record — never a certification that the record shows no error
 * (persona doc, "its Anders twin"). The report renders findings against
 * each item and says plainly when a screen found nothing.
 */
import type { ScreenId } from './vehicles';

export type AndersPhase = 'record' | 'review' | 'brief' | 'client' | 'after';

export interface AndersItem {
  id: string;
  phase: AndersPhase;
  text: string;
  source: string;
  /** Screens whose findings bear on this item; empty for pure process items. */
  screenIds: ScreenId[];
  confidence: 'proposed' | 'signed';
  signedBy?: string;
}

export const ANDERS_CHECKLIST: readonly AndersItem[] = [
  {
    id: 'record_complete',
    phase: 'record',
    text: "The clerk's and reporter's records are complete and accurate — every volume, every exhibit, every hearing the docket shows; gaps supplemented or corrected (TRAP 34.5(c), 34.6(d)). Items not reviewed (audio/video exhibits, missing volumes, low-confidence OCR pages) are listed.",
    source: 'Guideline 9.5(F); TRAP 34.5(c), 34.6(d)',
    screenIds: [],
    confidence: 'proposed',
  },
  {
    id: 'full_review',
    phase: 'review',
    text: 'Counsel personally and conscientiously examined the entire record for all reviewable errors; the engine\'s screens and page coverage are listed as a record of process, not as the review itself.',
    source: 'Anders v. California; Guideline 9.5(G)',
    screenIds: ['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification', 'plea_lane'],
    confidence: 'proposed',
  },
  {
    id: 'jurisdiction_and_certification',
    phase: 'review',
    text: "Appellate jurisdiction: the notice of appeal was timely (TRAP 26.2) and the trial court's certification of the defendant's right of appeal (TRAP 25.2(a)(2)) is in the record and correct — in a plea-bargain case, whether any matter was raised by written motion and ruled on before trial, or permission to appeal was given.",
    source: 'TRAP 25.2, 26.2; Dears v. State (certification checked by the court of appeals)',
    screenIds: ['preserved_error', 'plea_lane'],
    confidence: 'proposed',
  },
  {
    id: 'charging_instrument',
    phase: 'review',
    text: 'The indictment or information: alleges an offense, was not fundamentally defective, and any defect was raised before trial (Art. 1.14(b)) or is forfeited.',
    source: 'Tex. Code Crim. Proc. art. 1.14(b); Anders practice',
    screenIds: ['preserved_error'],
    confidence: 'proposed',
  },
  {
    id: 'pretrial_rulings',
    phase: 'review',
    text: 'Pretrial motions and rulings — suppression, competency, continuance, discovery — and whether each ruling was preserved and could arguably be error.',
    source: 'TRAP 33.1; Anders practice',
    screenIds: ['preserved_error', 'identification', 'brady'],
    confidence: 'proposed',
  },
  {
    id: 'jury_selection',
    phase: 'review',
    text: 'Jury selection: challenges for cause and their rulings, Batson objections, limits on questioning, any seated panelist with a disclosed bias or relationship, and the preservation steps for each.',
    source: 'Tex. Code Crim. Proc. art. 35.16; Batson v. Kentucky; Anders practice',
    screenIds: ['voir_dire', 'preserved_error'],
    confidence: 'proposed',
  },
  {
    id: 'evidence_and_objections',
    phase: 'review',
    text: 'Admission and exclusion of evidence: every objection traced to its ruling, running objections, limiting instructions, Confrontation issues, and the harm standard that would govern (TRAP 44.2(a)/(b)).',
    source: 'TRAP 33.1, 44.2; Anders practice',
    screenIds: ['preserved_error', 'junk_science', 'identification', 'brady'],
    confidence: 'proposed',
  },
  {
    id: 'expert_testimony',
    phase: 'review',
    text: 'Expert and quasi-expert testimony: qualification, reliability (Kelly/Daubert), scope beyond the underlying report, surrogate-analyst Confrontation issues.',
    source: 'Kelly v. State, 824 S.W.2d 568; Tex. R. Evid. 702; Anders practice',
    screenIds: ['junk_science'],
    confidence: 'proposed',
  },
  {
    id: 'jury_charge',
    phase: 'review',
    text: "The jury charge: application paragraphs, lesser-included offenses requested or refused, definitions, objections and requested instructions, and Almanza egregious-harm review for unobjected error.",
    source: 'Tex. Code Crim. Proc. art. 36.14, 36.19; Almanza v. State',
    screenIds: ['preserved_error'],
    confidence: 'proposed',
  },
  {
    id: 'sufficiency',
    phase: 'review',
    text: 'Legal sufficiency of the evidence on every element as charged, under Jackson v. Virginia as applied in Brooks v. State; the hypothetically correct jury charge (Malik).',
    source: 'Jackson v. Virginia; Brooks v. State, 323 S.W.3d 893; Malik v. State',
    screenIds: ['preserved_error'],
    confidence: 'proposed',
  },
  {
    id: 'plea_voluntariness',
    phase: 'review',
    text: 'In a plea case: admonishments (Art. 26.13), the plea\'s voluntariness on the face of the record, the judgment against the plea agreement, and the limits TRAP 25.2(a)(2) places on what may be raised.',
    source: 'Tex. Code Crim. Proc. art. 26.13; TRAP 25.2(a)(2)',
    screenIds: ['plea_lane'],
    confidence: 'proposed',
  },
  {
    id: 'punishment_and_judgment',
    phase: 'review',
    text: 'Punishment within the statutory range for the offense as found and enhanced; enhancement pleadings and findings; the written judgment against the oral pronouncement (the oral controls); court costs, fees and conditions the record does not support — reformation of the judgment is available even in an Anders appeal.',
    source: 'Tex. Code Crim. Proc. art. 42.01; Taylor v. State (oral pronouncement controls); Bray v. State (reformation in Anders cases)',
    screenIds: ['sentencing'],
    confidence: 'proposed',
  },
  {
    id: 'ineffective_assistance_on_the_record',
    phase: 'review',
    text: 'Whether the record on its face shows ineffective assistance of trial counsel (rare on direct appeal — Thompson v. State; most such claims belong in an 11.07 application), and whether the client has been told so.',
    source: 'Strickland v. Washington; Thompson v. State, 9 S.W.3d 808',
    screenIds: ['iac'],
    confidence: 'proposed',
  },
  {
    id: 'brief_contents',
    phase: 'brief',
    text: 'The brief is a professional evaluation of the record: it refers to anything in the record that might arguably support the appeal, with record references and authorities explaining why each is not arguable, and does not merely conclude the appeal is frivolous.',
    source: 'Anders v. California; High v. State, 573 S.W.2d 807',
    screenIds: ['preserved_error', 'voir_dire', 'junk_science', 'sentencing', 'identification', 'plea_lane'],
    confidence: 'proposed',
  },
  {
    id: 'motion_to_withdraw',
    phase: 'brief',
    text: 'A motion to withdraw accompanies the brief.',
    source: 'Anders v. California; Kelly v. State',
    screenIds: [],
    confidence: 'proposed',
  },
  {
    id: 'client_notice',
    phase: 'client',
    text: 'The client was sent a copy of the brief and the motion to withdraw, with a letter explaining the right to review the record and to file a pro se response, the deadline, and the right to seek discretionary review if the court of appeals affirms.',
    source: 'Kelly v. State, 436 S.W.3d 313',
    screenIds: [],
    confidence: 'proposed',
  },
  {
    id: 'record_access_form',
    phase: 'client',
    text: 'The client was given a form motion for pro se access to the appellate record, to be filed in the court of appeals within ten days (as recalled) of the letter.',
    source: 'Kelly v. State, 436 S.W.3d 313',
    screenIds: [],
    confidence: 'proposed',
  },
  {
    id: 'certification_to_court',
    phase: 'client',
    text: "Counsel's certification to the court of appeals that the Kelly duties were performed, with the date and the client's address.",
    source: 'Kelly v. State, 436 S.W.3d 313',
    screenIds: [],
    confidence: 'proposed',
  },
  {
    id: 'post_affirmance',
    phase: 'after',
    text: 'After the court of appeals affirms: within five days send the client the opinion and judgment with notice of the right to file a pro se PDR, by certified mail, return receipt requested, and file a letter certifying compliance.',
    source: 'TRAP 48.4; Guideline 9.6 (certified-mail PDR advice)',
    screenIds: [],
    confidence: 'proposed',
  },
];

/** Items a screen's findings bear on, in checklist order. */
export function andersItemsForScreen(screen: ScreenId): AndersItem[] {
  return ANDERS_CHECKLIST.filter((i) => i.screenIds.includes(screen));
}

export function unsignedAndersItems(): AndersItem[] {
  return ANDERS_CHECKLIST.filter((i) => i.confidence !== 'signed' || !i.signedBy);
}
