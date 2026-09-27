import crypto from 'crypto';
import { z } from 'zod';
import { CaseSummarySchema, normalizePreserved, normalizeHarmStandard, vehicleFor, type CaseSummary } from '@hg/case-lifecycle';
import { withTenant, appendCaseEvent } from '@hg/database';
import { beginStep, pulse, endStep } from './progress-pulse.service';

/**
 * The analysis orchestrator (system design §6, ENG-2). Drives the case
 * machine DOCS_COMPLETE → DIGITIZING → ANALYZING → ADJUDICATING → QA_REVIEW
 * through appendCaseEvent (every step is an event; the tracker follows via
 * the outbox).
 *
 * Contracts enforced HERE, not in prompts:
 *  - Model output is zod-validated structured data with one bounded retry —
 *    an invalid response never crashes a run or produces an unvalidated
 *    finding (M4 discipline).
 *  - FR-6 grounding is a HARD FILTER: a finding whose quote does not appear
 *    verbatim in its cited chunk is dropped, counted, and never persisted.
 *  - Citations store chunkId + sha256(chunk.content) — the FR-7
 *    re-verification anchors checked again at QA approval and at every
 *    customer render.
 *  - Cross-model adjudication is `not_run` while a single engine is
 *    configured (the Gemini/Claude adjudicator is the M4 remainder);
 *    QA reviews every finding regardless.
 */

export interface AnalysisModel {
  name: string;
  invoke(system: string, user: string): Promise<string>;
  /**
   * Optional bulk path (Message Batches, 50% price): all screen×sample
   * requests submitted together; the runner owns budgets and per-request
   * live fallback, and MUST return an entry for every key.
   */
  invokeMany?(requests: { key: string; instruction: string }[], record: string): Promise<Map<string, string>>;
}

const clipped = (n: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined), z.string().optional());
const stringList = (items: number, len: number) =>
  z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim().slice(0, len)).slice(0, items) : undefined),
    z.array(z.string()).optional()
  );
const FindingOutput = z.object({
  // Bounded free text, not an enum: the live Gary run proved the model's
  // specific labels ("Surrogate DNA analyst testimony / Confrontation…")
  // are BETTER than a forced bucket — and enum rejection silently voided
  // four screens of good findings. The canonical buckets are suggested in
  // the prompt; the DB column is a string; grouping is by severity.
  category: z.string().min(3).max(140),
  severity: z.enum(['dispositive', 'supportive', 'background']),
  confidence: z.number().min(0).max(1),
  chunkIndex: z.number().int().nonnegative(),
  quote: z.string().min(8),
  partA: z.string().min(1).max(2000),
  partB: z.string().min(1).max(4000),
  // Prompt set v2 (case-lifecycle/analysis-fields.ts). Lenient by design:
  // a malformed or missing field is clipped or dropped, never a rejection —
  // an enum rejection once voided four screens of good findings.
  preserved: clipped(40),
  preservedCite: clipped(600),
  harmStandard: clipped(60),
  develop: clipped(400),
  dependsOn: stringList(6, 120),
});
const FindingsResponse = z.object({ findings: z.array(FindingOutput).max(50) });

interface Screen {
  id: 'iac' | 'brady' | 'junk_science' | 'sentencing' | 'plea_lane' | 'voir_dire' | 'preserved_error' | 'identification';
  system: string;
}

// Condensed from prompt_specifications.md; the full five-screen prompt set
// with statute/registry MCP tools is the M4 remainder.
const SCREENS: Record<Screen['id'], string> = {
  iac: `You are a senior Texas appellate attorney screening a trial record for ineffective-assistance-of-counsel indicators under Strickland v. Washington (deficient performance AND prejudice), as applied by Texas courts (Ex parte Torres; the record-development lens of Art. 11.07). Sweep the ENTIRE record. Indicators to flag: failures to investigate or present available defenses/witnesses; un-objected prejudicial events (extraneous offenses, improper argument, inadmissible expert claims); harmful doors opened on direct or cross; conceded elements; absent motions the facts invited (suppression, severance, election, limiting instructions); punishment-phase failures (unprepared witnesses, no mitigation); conflicts of interest including counsel appointed as their own appellate counsel. For each, state both prongs: what a reasonable attorney would have done, and how the record shows harm.`,
  brady: `You are a forensic discovery auditor screening for Brady v. Maryland / Art. 39.14 (Michael Morton Act) indicators: favorable or impeaching material the record suggests existed but may not have been disclosed. Sweep the ENTIRE record. Indicators: evidence referenced in testimony but absent from disclosure discussions (videos, notes, raw data, photographs, recordings); witness statements describing collected-but-never-analyzed or lost/destroyed evidence (Youngblood angle); impeachment material (inconsistent statements, benefits, bias, disciplinary history); prosecutor statements acknowledging withheld or late-disclosed items; law-enforcement concessions that reports, recordings, or files exist beyond what was produced. Identify WHAT the item is, WHO referenced it, and WHY it is favorable or impeaching.`,
  junk_science: `You are a forensic-science consultant screening expert and quasi-expert testimony under Tex. Code Crim. Proc. Art. 11.073 (discredited or materially refined science) and Kelly/Daubert reliability: bite marks, hair comparison, arson indicators, dog-scent lineups, bloodstain-pattern overreach, historical cell-site overstatement, overstated DNA/statistics (source attribution from likelihood ratios), shaken-baby/abusive-head-trauma disputes, riflings/toolmarks certainty claims, and ANY opinion offered by a witness the record shows unqualified (no training, first time testifying to the method, consumer-grade tools). Also flag surrogate-analyst Confrontation issues (Bullcoming/Smith v. Arizona) and scientific claims exceeding the underlying report. Sweep the ENTIRE record including voir dire of experts.`,
  sentencing: `You are auditing judgment and sentence for illegal-sentence and sentencing-error indicators. Check: punishment outside the statutory range for the offense as charged and found; enhancement defects (invalid or unproven priors, missing identity linkage, sequence errors under Tex. Penal Code 12.42); double-jeopardy multiple punishments (lesser-included counts, Blockburger); cumulation-order legality (Art. 42.08, Penal Code 3.03 limits); variance between oral pronouncement and written judgment (fines, costs, credits — oral controls); time-credit errors (compare booking/arrest dates to credit awarded); deadly-weapon-finding defects; parole-law jury instruction errors (Art. 37.07 4); court costs and fines against indigency findings. Quote the exact pronouncement and judgment language.`,
  plea_lane: `You are screening plea papers and the plea colloquy for involuntary-plea indicators: missing or defective admonishments (Art. 26.13 — range, immigration, sex-offender registration); judgment terms that do not match the plea agreement; absent judicial confession or stipulation; affirmative misadvice (immigration/Padilla, parole eligibility, probation eligibility); coercion signals in the colloquy; failure to establish competency; charge-bargain terms the sentence exceeds. Compare every promise recited on the record against the judgment.`,
  preserved_error: `You are a Texas appellate attorney performing a preserved-error scan of the ENTIRE trial record for a direct appeal (four corners of the record). Track every objection to its ruling and the preservation posture under TRAP 33.1 (specific objection, ruling or refusal to rule, running objections, requests for instruction, motions for mistrial). Cover: Confrontation Clause (surrogate analysts, testimonial hearsay — Crawford, Bullcoming, Smith v. Arizona); hearsay rulings and whether the exception's PREDICATE is actually met (Art. 38.072 outcry requires a child under 14 or a disabled complainant — check the age; Rule 803(2) excited utterance requires the statement while still under stress of the event — check elapsed time and intervening events; Rule 803(4) medical diagnosis requires a treatment purpose); improper jury argument (burden-shifting, comment on failure to testify or to call witnesses, community expectation, striking at the defendant over counsel's shoulders) with the objection/instruction/mistrial sequence; vouching and bolstering (a witness's relationship with the prosecutor, prior 'expert' status, lists of joint cases, class-based truthfulness testimony); Rule 403/404(b) extraneous-offense rulings and notice; the jury charge (Almanza — objected vs. egregious harm); expert qualification rulings (701/702, Kelly/Daubert); sufficiency and directed-verdict rulings including venue. For each, state the objection, the ruling, the record page, whether it is preserved (yes / partial / no), and the harm standard that will govern review.`,
  identification: `You are a Texas appellate attorney screening how the defendant was identified. Cover: pretrial identification procedures — photo arrays, photospreads, lineups, show-ups — and their construction (who assembled the array, whether the administrator knew the suspect, filler similarity, instructions given, the witness's certainty statement and its wording); any facial-recognition or database-driven suspect development that seeded the procedure; in-court identification and its independent basis; whether a motion to suppress the identification or a pretrial hearing exists and what it found; and the Neil v. Biggers / Manson v. Brathwaite reliability factors (opportunity to view, attention, prior description accuracy, certainty, time elapsed). Distinguish a record claim (objection or suppression motion made and ruled on) from counsel's failure to make one.`,
  voir_dire: `You are a Texas appellate attorney screening jury selection (voir dire) for juror-bias and preserved-error indicators. Cross-reference every venire member's disclosures against the case principals (victim, witnesses, law enforcement, parties) named in the CASE CONTEXT. Flag: relationships to principals (familial, employment, spouse-of — actual or implied bias, Art. 35.16); bias admissions followed by denied challenges for cause, absent challenges, or conclusory one-question rehabilitation; commitments hostile to rights (silence as guilt, presumption reversal, automatic credibility for officers); Batson indicators; panelists exposed to prejudicial information; truncated individual voir dire. For each flagged panelist, give their number AND trace whether the record shows them struck, excused, or SEATED (seating list and jury polls) — a seated biased juror is the highest-severity outcome.`,
};

const SCREENS_BY_LANE: Record<'TRIAL' | 'PLEA', Screen['id'][]> = {
  TRIAL: ['iac', 'brady', 'junk_science', 'sentencing', 'voir_dire'],
  PLEA: ['plea_lane', 'sentencing'],
};

/**
 * Prompt set v2 (2026-09-27): what a manual appellate review does that the
 * v1 screens did not — a dedicated preserved-error scan (PRD FR-1), an
 * identification-procedure screen, structured per-finding fields, and a
 * severity calibration that knows the appellate harm standard. Selected by
 * ANALYSIS_PROMPT_SET (render.yaml sets v2 since 2026-09-27). Without the
 * variable, production falls back to v1 so a config rollback is one value;
 * prompts are a model change under NFR-1, so re-score the Gary ledger
 * after any change to a set.
 */
const SCREENS_BY_LANE_V2: Record<'TRIAL' | 'PLEA', Screen['id'][]> = {
  TRIAL: ['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification'],
  PLEA: ['plea_lane', 'sentencing'],
};
export type PromptSet = 'v1' | 'v2';
export function promptSet(): PromptSet {
  const v = process.env.ANALYSIS_PROMPT_SET;
  if (v === 'v1' || v === 'v2') return v;
  return process.env.NODE_ENV === 'production' ? 'v1' : 'v2';
}
export function screensForLane(lane: 'TRIAL' | 'PLEA'): Screen['id'][] {
  return (promptSet() === 'v2' ? SCREENS_BY_LANE_V2 : SCREENS_BY_LANE)[lane];
}

/** v2-only additions to existing screens; v1 prompts stay byte-identical. */
const SCREEN_ADDENDA_V2: Partial<Record<Screen['id'], string>> = {
  iac: `Also compare the State's narrative against the physical record: for each material fact the State asserted (what was bought, drunk, driven, sent, found), cite any exhibit or testimony that contradicts it, and note whether counsel used the contradiction; and flag counsel's failure to subpoena or demand a non-testifying analyst whose report came in through a surrogate, and the absence of a motion to suppress a suggestive identification.`,
  brady: `Also list any State narrative fact that the exhibits contradict (surveillance video, receipts, records) and any test that could have been run and was not (toxicology, trace, DNA on a collected item) — untested evidence in State custody is a disclosure and investigation question.`,
};

/**
 * Case-context pre-pass (one cached-read call before the screens): a
 * voir-dire relationship to "Brian Harper" only reads as victim contact if
 * the screen knows Harper IS the victim — cross-referencing a name 400k
 * tokens apart is exactly what a long-context single pass misses (proven
 * on the Brian record: the Willetts juror finding appears ONLY with this
 * header, then at dispositive severity). The header is model-derived, so
 * it never bypasses grounding: findings still verify verbatim.
 */
const CONTEXT_INSTRUCTIONS =
  'From the record above identify: the defendant; the offense(s) charged; the complainant/victim name(s) and role; key State witnesses (law enforcement, experts, outcry/medical); and the central contested issue at trial. Respond with ONE compact plain-text paragraph beginning "CASE CONTEXT:" (max ~150 words). No JSON, no headings, no analysis.';

const SUMMARY_INSTRUCTIONS =
  'From the record above extract the case summary for the top of a report. Respond with ONLY a JSON object with these keys (each either null or {"value":"<short fact>","cite":{"volume":"<volume file if shown>","page":<page number if shown>,"quote":"<VERBATIM text copied from the record that states this fact>"}}): defendant (full name), county, court (court and county), causeNumber, offense (charge(s) as stated, with degree), offenseDate, trialDates (start–end or the date), verdict (jury or court, what was found), sentence (as pronounced), judgmentDate, appeal (court of appeals cause, outcome, date, if any), priorWrits (any prior writ application: article, filed date, outcome). The quote MUST be copied character-for-character from the record. If the record does not state a fact, use null — never guess or infer.';

const OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object: {"findings":[{"category":"<preserved_error|iac|brady|junk_science|sentencing|deadline|appeal_restoration — or a short specific label if none fits>","severity":"dispositive|supportive|background","confidence":0..1,"chunkIndex":<index of the excerpt the finding cites>,"quote":"<VERBATIM text copied from that excerpt>","partA":"<plain English for a family, 8th-grade level, no advice>","partB":"<precise statement for an attorney>"}]}. Severity calibration: "dispositive" = could plausibly justify relief or major posture change on its own (illegal sentence, seated biased juror, suppressed exculpatory evidence); "supportive" = strengthens a claim package but needs companions; "background" = context a lawyer should know. The quote MUST be copied character-for-character from one excerpt. If nothing qualifies, return {"findings":[]}.`;

const OUTPUT_INSTRUCTIONS_V2 = `Respond with ONLY a JSON object: {"findings":[{"category":"<preserved_error|iac|brady|junk_science|sentencing|identification|deadline|appeal_restoration — or a short specific label if none fits>","severity":"dispositive|supportive|background","confidence":0..1,"chunkIndex":<index of the excerpt the finding cites>,"quote":"<VERBATIM text copied from that excerpt>","partA":"<plain English for a family, 8th-grade level, no advice>","partB":"<precise statement for an attorney>","preserved":"yes|partial|no|unknown","preservedCite":"<VERBATIM objection or ruling text from the record, or omit>","harmStandard":"structural|constitutional|nonconstitutional|none","develop":"<one sentence, max 40 words: the record or investigation step that would prove or rule this out — obtain X, subpoena Y, compare Z>","dependsOn":["<a record or exhibit this finding needs that was not provided, e.g. Volume 6 exhibits>"]}]}. Severity calibration: "dispositive" = could plausibly justify relief or major posture change on its own (an illegal or void sentence, a seated biased juror, suppressed exculpatory evidence, a preserved constitutional error going to the core of the State's proof); "supportive" = strengthens a claim package but needs companions; "background" = context a lawyer should know. Weigh the review standard: a preserved constitutional error is reviewed under TRAP 44.2(a) — reversal unless the State shows it harmless beyond a reasonable doubt — and is at least supportive; a preserved non-constitutional error under 44.2(b) is supportive unless the record shows harm to a substantial right; an unpreserved record error is background unless structural, since it is reachable only through counsel's performance. "preserved" means an objection was made and ruled on; "partial" means a running or general objection, or an objection without a ruling. The quote MUST be copied character-for-character from one excerpt. Keep "develop" concrete and short. If nothing qualifies, return {"findings":[]}.`;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Fingerprint of the prompt set actually used — stored on the run for reproducibility (ENG-8). */
export function promptHash(set: PromptSet = promptSet()): string {
  const screens = (set === 'v2' ? SCREENS_BY_LANE_V2 : SCREENS_BY_LANE).TRIAL.concat(SCREENS_BY_LANE.PLEA)
    .map((id) => `${id}:${SCREENS[id]}${set === 'v2' ? SCREEN_ADDENDA_V2[id] ?? '' : ''}`)
    .join('\n');
  return sha256(`${set}\n${screens}\n${set === 'v2' ? OUTPUT_INSTRUCTIONS_V2 : OUTPUT_INSTRUCTIONS}`).slice(0, 12);
}

/**
 * Whitespace-normalized comparison for grounding: court transcripts break
 * sentences across lines (and OCR inserts tabs), so a model's naturally
 * joined verbatim quote fails an exact includes() — which was silently
 * dropping TRUE findings (Brian's record: a seated juror married to the
 * victim's supervisor). Normalization applies to the MATCH only; the
 * stored excerpt and the sha256 chunk-tamper anchors stay exact.
 */
const normWs = (s: string) => s.replace(/\s+/g, ' ').trim();
export const quoteGrounds = (chunkContent: string, quote: string) =>
  normWs(chunkContent).includes(normWs(quote));

/**
 * Escape raw control characters that appear INSIDE string literals — the
 * prompt demands quotes copied character-for-character, so the model
 * faithfully reproduces transcript line breaks inside JSON strings, which
 * is invalid JSON (learned on Brian's line-broken reporter's record).
 * String-aware: control characters outside strings (legal whitespace) are
 * untouched; the unescaped value round-trips back to the real newline.
 */
function escapeControlCharsInStrings(jsonText: string): string {
  let out = '';
  let inStr = false, esc = false;
  for (const ch of jsonText) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === '\\') { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += code === 10 ? '\\n' : code === 13 ? '\\r' : code === 9 ? '\\t' : '';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

/**
 * Recover complete top-level objects from a truncated findings array —
 * a max_tokens cutoff mid-array must not void the findings that finished
 * (learned from the Fable comparison run: verbose models hit the cap).
 */
function salvageTruncatedArray(jsonText: string): unknown[] | null {
  const start = jsonText.indexOf('[');
  if (start < 0) return null;
  const items: unknown[] = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') { if (depth === 0) objStart = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { items.push(JSON.parse(jsonText.slice(objStart, i + 1))); } catch { /* skip */ }
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) break;
  }
  return items.length ? items : null;
}

/** One response → validated findings, or null (all salvage layers applied). */
export function parseFindingsText(raw: string): { findings: z.infer<typeof FindingOutput>[] } | null {
  try {
    const jsonText = escapeControlCharsInStrings(
      raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    );
    let elements: unknown[];
    try {
      const parsed = JSON.parse(jsonText) as { findings?: unknown[] };
      if (!Array.isArray(parsed.findings)) throw new Error('no findings array');
      elements = parsed.findings;
    } catch (parseErr) {
      const recovered = salvageTruncatedArray(jsonText);
      if (!recovered) throw parseErr;
      console.warn(`[analysis] truncated response — recovered ${recovered.length} complete finding(s)`);
      elements = recovered;
    }
    // Per-finding salvage: one malformed element must never void its
    // siblings (the second lesson of the first live run).
    const findings: z.infer<typeof FindingOutput>[] = [];
    let invalid = 0;
    for (const item of elements) {
      const check = FindingOutput.safeParse(item);
      if (check.success) findings.push(check.data);
      else invalid++;
    }
    if (invalid > 0) console.warn(`[analysis] salvage: kept ${findings.length}, dropped ${invalid} malformed finding(s)`);
    return { findings };
  } catch (e) {
    console.warn(`[analysis] response parse failed: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

async function invokeValidated(model: AnalysisModel, system: string, user: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await model.invoke(system, user);
    const parsed = parseFindingsText(raw);
    if (parsed) return parsed;
  }
  return { findings: [] }; // bounded: empty screen for QA, never a crash
}

export interface AnalysisSummary {
  runId: string;
  screensRun: number;
  findingsPersisted: number;
  droppedUngrounded: number;
  /** Passages a second screen grounded that were folded into one finding. */
  mergedAcrossScreens: number;
}

export interface AnalysisChunk {
  id: string;
  documentId: string;
  content: string;
  metadata: unknown;
}

/**
 * The frozen record prompt — byte-stable across screens (cache prefix).
 * Excerpt headers carry source structure (volume file + page) so the model
 * knows WHERE it is (voir dire vs. punishment) — better phase-targeted
 * recall and better citations.
 */
export function buildRecord(chunks: AnalysisChunk[]): string {
  return chunks
    .map((c, i) => {
      const m = (c.metadata ?? {}) as { page?: number; filename?: string };
      const src = [m.filename, m.page != null ? `p.${m.page}` : null].filter(Boolean).join(' ');
      return `[Excerpt ${i}${src ? ` | ${src}` : ''}] ${c.content}`;
    })
    .join('\n\n');
}

/**
 * Deterministic attention anchors — code, not model. Converts known miss
 * classes into guaranteed coverage: (a) keyword classes per screen, and
 * (b) case-principal names (from the context header) cross-referenced into
 * jury-selection excerpts — the scan that catches a venire member linked
 * to the victim regardless of long-context attention.
 */
/**
 * Discredited/contested-method registry (Art. 11.073 families; MCP-lite —
 * the interactive mcp-forensic-science server is post-MVP, but the
 * registry TERMS drive deterministic anchors today so no mention of a
 * listed method escapes the junk-science screen's attention).
 */
const FORENSIC_REGISTRY_TERMS = [
  'bite mark', 'bitemark', 'hair comparison', 'hair analysis', 'microscopic hair',
  'arson', 'pour pattern', 'accelerant', 'dog scent', 'scent lineup', 'bloodstain pattern',
  'blood spatter', 'shaken baby', 'abusive head trauma', 'cell site', 'cell tower', 'CDR',
  'likelihood ratio', 'random match', 'toolmark', 'ballistics match', 'firearms identification',
  'comparative bullet lead', 'gunshot residue', 'GSR', 'facial recognition', 'hypnosis',
  'field sobriety', 'drug recognition expert', 'touch DNA', 'DNA mixture',
];
const FORENSIC_REGISTRY_RE = new RegExp(`\\b(${FORENSIC_REGISTRY_TERMS.join('|').replace(/ /g, '\\s+')})\\b`, 'i');

const ANCHOR_PATTERNS: Partial<Record<Screen['id'], RegExp>> = {
  junk_science: FORENSIC_REGISTRY_RE,
  voir_dire: /\b(JUROR|VENIRE|panel member|strike|peremptor|challenge for cause)\b/i,
  sentencing: /\b(pronounce|consecutive|cumulat|stacked|credit for time|time credit|enhancement|habitual|deadly weapon)\b/i,
  iac: /\bobjection\b.{0,80}\b(overruled|sustained)\b/is,
  preserved_error: /\bobjection\b.{0,80}\b(overruled|sustained|denied)\b|\brunning objection\b|\b(move|motion) for (a )?mistrial\b|\bnote (our|my) exception\b|\bcharge conference\b/is,
  identification: /\b(photo\s?(array|spread|line-?up)|line-?up|six-?pack|facial recognition|identif(y|ied|ication)|show-?up|Biggers)\b/i,
  brady: /\b(not (?:been )?(?:disclosed|produced|turned over)|working file|withheld|never (?:tested|analyzed|examined)|lost|destroyed)\b/i,
};

export function buildAnchors(
  screenId: Screen['id'],
  chunks: AnalysisChunk[],
  contextHeader: string
): string {
  const hits = new Set<number>();
  const pattern = ANCHOR_PATTERNS[screenId];
  if (pattern) {
    chunks.forEach((c, i) => {
      if (pattern.test(c.content)) hits.add(i);
    });
  }
  if (screenId === 'voir_dire' && contextHeader) {
    // Case-principal surnames (capitalized tokens of 3+ letters, minus noise)
    const STOP = new Set(['CASE', 'CONTEXT', 'The', 'Defendant', 'State', 'Texas', 'County', 'Court', 'District', 'Cause', 'Deputy', 'Officer', 'Sergeant', 'Investigator', 'Detective', 'Attempted', 'Capital', 'Murder', 'Police', 'Department']);
    const names = [...new Set((contextHeader.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).filter((n) => !STOP.has(n)))];
    const jurorish = /\b(JUROR|VENIRE)\b/i;
    chunks.forEach((c, i) => {
      if (jurorish.test(c.content) && names.some((n) => c.content.includes(n))) hits.add(i);
    });
  }
  if (hits.size === 0) return '';
  const list = [...hits].sort((a, b) => a - b).slice(0, 60);
  return `Deterministic pre-scan: excerpts especially likely to matter for this screen — review each individually: ${list.join(', ')}.`;
}

export interface ScreenFinding {
  category: string;
  severity: string;
  confidence: number;
  quote: string;
  partA: string;
  partB: string;
  chunk: AnalysisChunk;
  /** Engine that produced the kept copy (multi-engine union). */
  engine?: string;
  // Prompt set v2 fields (optional — v1 findings never carry them).
  preserved?: string;
  preservedCite?: string;
  harmStandard?: string;
  develop?: string;
  dependsOn?: string[];
}

/**
 * One screen, NO database transaction: model call → zod validation → FR-6
 * grounding hard filter. Shared by the pipeline and the model-comparison
 * eval path (model_evaluation.md §4.1: swaps happen at the model seam,
 * everything else held constant).
 */
const SEVERITY_RANK: Record<string, number> = { dispositive: 0, supportive: 1, background: 2 };

export function buildScreenInstruction(
  screenId: keyof typeof SCREENS,
  chunks: AnalysisChunk[],
  contextHeader = ''
): string {
  const prefix = contextHeader ? `${contextHeader}\n\n` : '';
  const anchors = buildAnchors(screenId, chunks, contextHeader);
  const v2 = promptSet() === 'v2';
  const addendum = v2 ? SCREEN_ADDENDA_V2[screenId] : undefined;
  return `${prefix}${SCREENS[screenId]}${addendum ? `\n${addendum}` : ''}\n${anchors ? `${anchors}\n` : ''}${v2 ? OUTPUT_INSTRUCTIONS_V2 : OUTPUT_INSTRUCTIONS}`;
}

/**
 * Self-consistency union over sampled responses: run-to-run variance IS
 * recall left on the table. Ground each sample's findings (FR-6 hard
 * filter), then dedup near-duplicates (same chunk, one normalized quote
 * containing the other) keeping the more severe / more confident copy.
 * QA reviews the union — recall-first by design. Shared by the live loop
 * and the batch path.
 */
export function groundUnion(
  sampleFindings: (z.infer<typeof FindingOutput> & { engine?: string })[][],
  chunks: AnalysisChunk[]
): { grounded: ScreenFinding[]; dropped: number; agreements: number } {
  const grounded: ScreenFinding[] = [];
  let dropped = 0;
  let agreements = 0;
  for (const findings of sampleFindings) {
    for (const f of findings) {
      const chunk = chunks[f.chunkIndex];
      // FR-6: grounding is a hard filter, not a preference.
      if (!chunk || !quoteGrounds(chunk.content, f.quote)) {
        dropped++;
        continue;
      }
      const q = f.quote.replace(/\s+/g, ' ').trim().toLowerCase();
      const dup = grounded.findIndex((g) => {
        if (g.chunk.id !== chunk.id) return false;
        const gq = g.quote.replace(/\s+/g, ' ').trim().toLowerCase();
        return gq.includes(q) || q.includes(gq);
      });
      if (dup >= 0) {
        const keep = grounded[dup];
        // Two ENGINES independently grounding the same passage is the
        // adjudication signal (coverage-union model: agreement, never veto).
        if (f.engine && keep.engine && f.engine !== keep.engine) agreements++;
        const better =
          SEVERITY_RANK[f.severity] < SEVERITY_RANK[keep.severity] ||
          (f.severity === keep.severity && f.confidence > keep.confidence);
        if (better) grounded[dup] = { ...f, chunk };
        continue;
      }
      grounded.push({ ...f, chunk });
    }
  }
  return { grounded, dropped, agreements };
}

/** Normalized form used for passage comparison (whitespace/case-insensitive). */
export const normalizeQuote = (q: string) => q.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Is `quote` the same passage as one already kept for this chunk? Containment
 * either way, matching the within-screen rule in groundUnion: screens quote
 * the same moment at different lengths.
 */
export function findSamePassage<T extends { quote: string }>(
  siblings: readonly T[],
  quote: string
): T | undefined {
  const q = normalizeQuote(quote);
  return siblings.find((k) => k.quote.includes(q) || q.includes(k.quote));
}

/** Does the incoming copy of a passage beat the one already kept? */
export function isStrongerFinding(
  incoming: { severity: string; confidence: number },
  kept: { severity: string; confidence: number }
): boolean {
  const a = SEVERITY_RANK[incoming.severity as keyof typeof SEVERITY_RANK];
  const b = SEVERITY_RANK[kept.severity as keyof typeof SEVERITY_RANK];
  if (a !== b) return a < b;
  return incoming.confidence > kept.confidence;
}

/**
 * The v2 fields as they are persisted. The preservation cite is kept only
 * when it grounds verbatim somewhere in the record (an objection is usually
 * in a different excerpt from the quoted passage), so a cite a lawyer reads
 * is as trustworthy as the finding's own quote. `vehicle` is derived.
 */
export function structuredFields(
  f: { category: string; preserved?: string; preservedCite?: string; harmStandard?: string; develop?: string; dependsOn?: string[] },
  screenId: string,
  chunks: AnalysisChunk[]
): { preserved: string; preservedCite: string | null; harmStandard: string; vehicle: string; develop: string | null; dependsOn: string[] } {
  const preserved = normalizePreserved(f.preserved);
  const harmStandard = normalizeHarmStandard(f.harmStandard);
  const cite = f.preservedCite && chunks.some((c) => quoteGrounds(c.content, f.preservedCite!)) ? f.preservedCite : null;
  return {
    preserved,
    preservedCite: cite,
    harmStandard,
    vehicle: vehicleFor({ screen: screenId, category: f.category, preserved, harmStandard }),
    develop: f.develop ?? null,
    dependsOn: f.dependsOn ?? [],
  };
}

const PRESERVED_STRENGTH: Record<string, number> = { yes: 3, partial: 2, no: 1, unknown: 0 };
/** Between two screens' preservation calls, the stronger wins; a grounded cite breaks ties. */
export function strongerPreserved(current: string, incoming: string, incomingHasCite: boolean): string {
  const a = PRESERVED_STRENGTH[current] ?? 0, b = PRESERVED_STRENGTH[incoming] ?? 0;
  if (b > a) return incoming;
  if (b === a && incomingHasCite) return incoming;
  return current;
}

export async function executeScreen(
  model: AnalysisModel,
  screenId: keyof typeof SCREENS,
  record: string,
  chunks: AnalysisChunk[],
  contextHeader = '',
  samples = 1
): Promise<{ grounded: ScreenFinding[]; dropped: number }> {
  const instruction = buildScreenInstruction(screenId, chunks, contextHeader);
  const arrays: z.infer<typeof FindingOutput>[][] = [];
  for (let n = 0; n < Math.max(1, samples); n++) {
    arrays.push((await invokeValidated(model, instruction, record)).findings);
  }
  return groundUnion(arrays, chunks);
}

export { SCREENS_BY_LANE, SCREENS_BY_LANE_V2 };

/** The pre-pass itself — shared by the pipeline and compare-models. */
/**
 * Case summary (report header, PO 2026-09-12): one cached-read call; every
 * fact must carry a quote that grounds VERBATIM in a chunk (whitespace-
 * normalized, like FR-6) — an ungrounded fact is dropped, never softened.
 * Never a gate: any failure yields null and the run proceeds.
 */
export async function buildCaseSummary(model: AnalysisModel, record: string, chunks: AnalysisChunk[]): Promise<CaseSummary | null> {
  try {
    const raw = (await model.invoke(SUMMARY_INSTRUCTIONS, record)).trim();
    const start = raw.indexOf('{');
    if (start < 0) return null;
    const parsed = CaseSummarySchema.safeParse(JSON.parse(raw.slice(start, raw.lastIndexOf('}') + 1)));
    if (!parsed.success) return null;
    const out: CaseSummary = {};
    let kept = 0;
    for (const key of Object.keys(parsed.data) as (keyof CaseSummary)[]) {
      const f = parsed.data[key];
      if (!f) continue;
      const grounded = chunks.some((c) => quoteGrounds(c.content, f.cite.quote));
      if (grounded) { out[key] = f; kept++; }
      else console.warn(`[analysis] summary fact '${key}' dropped — quote not found verbatim in the record`);
    }
    return kept ? out : null;
  } catch (e) {
    console.warn(`[analysis] case summary skipped: ${(e as Error).message.slice(0, 120)}`);
    return null;
  }
}

export async function buildContextHeader(model: AnalysisModel, record: string): Promise<string> {
  try {
    const text = (await model.invoke(CONTEXT_INSTRUCTIONS, record)).trim();
    // Tolerate a misbehaving model: context is an aid, never a gate.
    if (!text || text.startsWith('{')) return '';
    return text.slice(0, 2000);
  } catch {
    return '';
  }
}

/** Durable start marker for a pre-check phase (status page cold loads). */
async function markPhase(
  caseId: string,
  tenantId: string,
  phase: 'context' | 'summary' | 'batch',
  screensTotal: number,
  requestsTotal?: number
): Promise<void> {
  await withTenant(tenantId, (tx) =>
    appendCaseEvent(tx, {
      caseId, tenantId, type: 'analysis.phase',
      payload: { phase, screensTotal, ...(requestsTotal != null ? { requestsTotal } : {}) },
      actor: 'pipeline',
    })
  );
}

/**
 * Whatever happens inside a run, its live pulse ends with it — a crashed
 * run must not keep telling the family "reading the record" until the
 * retry begins.
 */
export async function runAnalysis(
  caseId: string,
  tenantId: string,
  modelOrModels: AnalysisModel | AnalysisModel[]
): Promise<AnalysisSummary> {
  try {
    return await runAnalysisInner(caseId, tenantId, modelOrModels);
  } finally {
    endStep(caseId);
  }
}

/**
 * Transaction shape (learned the expensive way on the first live run):
 * model calls run OUTSIDE any transaction — a Prisma interactive
 * transaction times out in seconds while a screen takes minutes, which
 * killed persistence after ~$2 of paid model work. Each screen commits its
 * own short transaction, so `screen.completed` events reach the tracker as
 * they happen and a late crash never rolls back earlier screens' work.
 */
async function runAnalysisInner(
  caseId: string,
  tenantId: string,
  modelOrModels: AnalysisModel | AnalysisModel[]
): Promise<AnalysisSummary> {
  // Multi-engine union (Advanced tier): engines complement rather than
  // contradict (measured Aug-31 comparisons, ~+50–77% coverage), so
  // additional engines ADD findings into the same QA set; cross-engine
  // duplicates count as adjudication agreements, never vetoes.
  const models = Array.isArray(modelOrModels) ? modelOrModels : [modelOrModels];
  const model = models[0];
  // Short tx 1: validate, freeze chunks, create the run, enter the stages.
  const { run, chunks, lane } = await withTenant(tenantId, async (tx) => {
    const kase = await tx.case.findUniqueOrThrow({ where: { id: caseId } });
    // ANALYZING re-entry allows a crashed run's retry; QA_REJECTED re-entry
    // is the QA-rejection re-run loop (QA_REJECTED → ANALYZING is legal).
    if (!['DOCS_COMPLETE', 'ANALYZING', 'QA_REJECTED'].includes(kase.status)) {
      throw new Error(`runAnalysis requires DOCS_COMPLETE, case is ${kase.status}`);
    }
    if (kase.status === 'QA_REJECTED') {
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'stage.entered', payload: { status: 'ANALYZING' },
        actor: 'pipeline', transition: 'ANALYZING',
      });
    }

    const documents = await tx.document.findMany({
      where: { caseId },
      include: { chunks: true },
      orderBy: { createdAt: 'asc' },
    });
    const frozen = documents.flatMap((d) => d.chunks.map((c) => ({ ...c, documentId: d.id })));
    if (frozen.length === 0) throw new Error('No digitized text to analyze');

    const runNo = (await tx.analysisRun.count({ where: { caseId } })) + 1;
    const created = await tx.analysisRun.create({
      data: { caseId, tenantId, runNo, modelConfig: { model: model.name, screens: promptSet(), promptHash: promptHash() } },
    });

    if (kase.status === 'DOCS_COMPLETE') {
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'stage.entered', payload: { status: 'DIGITIZING' },
        actor: 'pipeline', transition: 'DIGITIZING',
      });
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'stage.entered', payload: { status: 'ANALYZING' },
        actor: 'pipeline', transition: 'ANALYZING',
      });
    }

    return { run: created, chunks: frozen, lane: (kase.lane ?? 'TRIAL') as 'TRIAL' | 'PLEA' };
  });

  const record = buildRecord(chunks);
  let persisted = 0;
  let dropped = 0;

  // Status page: the phases before the first check used to be silence —
  // a durable marker each (cold loads) plus a live pulse (liveness).
  const screensTotal = screensForLane(lane).length;
  await markPhase(caseId, tenantId, 'context', screensTotal);
  beginStep(caseId, { stage: 'analyzing', label: 'context', screensTotal });
  // Context pre-pass: outside any transaction, one cached-read call.
  const contextHeader = await buildContextHeader(model, record);
  if (contextHeader) console.log(`[analysis] context header: ${contextHeader.slice(0, 160)}…`);
  // Case summary for the report header — persisted on the run so every
  // report version renders the summary its findings were built alongside.
  await markPhase(caseId, tenantId, 'summary', screensTotal);
  beginStep(caseId, { stage: 'analyzing', label: 'summary', screensTotal });
  const caseSummary = await buildCaseSummary(model, record, chunks);
  if (caseSummary) {
    await withTenant(tenantId, (tx) => tx.analysisRun.update({ where: { id: run.id }, data: { summary: caseSummary as object } }));
    console.log(`[analysis] case summary: ${Object.keys(caseSummary).length} fact(s) grounded`);
  }
  // v2: the judgment facts the summary already grounded verbatim ride into
  // every screen's context — a review that stops at the verdict misses the
  // punishment phase, where the strongest claims usually are.
  const screenHeader =
    promptSet() === 'v2' && caseSummary
      ? [contextHeader,
          caseSummary.sentence?.value ? `SENTENCE AS PRONOUNCED (from the record): ${caseSummary.sentence.value}` : '',
          caseSummary.verdict?.value ? `VERDICT (from the record): ${caseSummary.verdict.value}` : '']
          .filter(Boolean).join('\n')
      : contextHeader;

  const samples = Math.min(3, Math.max(1, Number(process.env.ANALYSIS_SAMPLES ?? '1') || 1));

  // Per-engine batch path (50% price): each engine's screen×sample requests
  // go out as one batch; the runner (worker) owns polling, the stage
  // budget, and per-request live fallback. Live engines run per screen.
  // Batch economics gate (measured Aug 31): parallel batch items RACE the
  // prompt cache — on a 695k-token record 7/10 items re-wrote the cache
  // and the "50% price" run cost ~2× live-sequential. Below the threshold
  // batch wins clearly (282k record: perfect hits, ~$1.75/run); above it,
  // live sequential caching is the cheaper certainty.
  const batchMaxTokens = Number(process.env.ANALYSIS_BATCH_MAX_RECORD_TOKENS ?? '') || 400_000;
  // 2.3 chars/token, MEASURED on real transcripts (Brian: 1.6M chars →
  // 695,332 actual cached tokens). The generic 4:1 heuristic undercounted
  // by ~1.75× and let a 695k record through the 400k gate.
  const recordTokensEst = Math.round(record.length / 2.3);
  const batchAllowed = recordTokensEst <= batchMaxTokens;
  if (!batchAllowed && models.some((m) => m.invokeMany)) {
    console.log(`[analysis] record ~${recordTokensEst} tokens > ${batchMaxTokens} — batch skipped, live sequential caching`);
  }

  const batchByEngine = new Map<string, Map<string, string>>();
  for (const m of models) {
    if (!m.invokeMany || !batchAllowed) continue;
    // Production's usual path: every check goes out at once and nothing
    // per check comes back until the batch ends — the page needs to know
    // it is waiting on N passes, and the batch runner pulses each poll.
    const requestsTotal = screensTotal * samples;
    await markPhase(caseId, tenantId, 'batch', screensTotal, requestsTotal);
    beginStep(caseId, { stage: 'analyzing', label: 'batch', screensTotal, done: 0, total: requestsTotal }, 'waiting');
    batchByEngine.set(
      m.name,
      await m.invokeMany(
        screensForLane(lane).flatMap((screenId) =>
          Array.from({ length: samples }, (_, n) => ({
            key: `${screenId}__${n}`,
            instruction: buildScreenInstruction(screenId, chunks, screenHeader),
          }))
        ),
        record
      )
    );
  }

  let agreements = 0;
  let mergedAcrossScreens = 0;

  /**
   * Cross-screen union. `groundUnion` collapses duplicates WITHIN one screen's
   * samples, but every screen sweeps the whole record, so the same passage is
   * routinely grounded by two of them — a seated biased juror is both an `iac`
   * failure and a `voir_dire` finding. Persisted per screen, that reached the
   * family as the same issue written twice under different labels.
   *
   * One passage is now one finding: the strongest copy wins the row, and every
   * other screen that grounded it is recorded in `alsoFoundBy` — so the report
   * can show the full spread of trial-process categories instead of repeating
   * one issue.
   */
  const keptByChunk = new Map<string, Array<{
    id: string; quote: string; category: string; severity: string; confidence: number;
    screen: string; seenBy: Set<string>;
    preserved: string; preservedCite?: string; dependsOn: string[];
  }>>();


  for (const screenId of screensForLane(lane)) {
    const arrays: Parameters<typeof groundUnion>[0] = [];
    for (const m of models) {
      const batched = batchByEngine.get(m.name);
      if (batched) {
        for (let n = 0; n < samples; n++) {
          const raw = batched.get(`${screenId}__${n}`);
          if (raw == null) continue; // runner contract violation — tolerated
          const parsed = parseFindingsText(raw);
          if (parsed) arrays.push(parsed.findings.map((f) => ({ ...f, engine: m.name })));
        }
      } else {
        // Model call: minutes, OUTSIDE any transaction.
        const instruction = buildScreenInstruction(screenId, chunks, screenHeader);
        for (let n = 0; n < samples; n++) {
          // Proof of life for a 15–20 minute call: recorded BEFORE the call,
          // in its own short tx, so the family's page and the ops card move.
          await withTenant(tenantId, (tx) =>
            appendCaseEvent(tx, {
              caseId, tenantId, type: 'analysis.progress',
              payload: {
                screen: (screenId === 'plea_lane' ? 'plea_lane' : screenId) as 'iac',
                sample: n + 1, samplesTotal: samples,
                screenIndex: screensForLane(lane).indexOf(screenId) + 1, screensTotal: screensForLane(lane).length,
              },
              actor: 'pipeline',
            })
          );
          beginStep(caseId, {
            stage: 'analyzing', label: 'check', screen: screenId,
            sample: n + 1, samplesTotal: samples,
            screenIndex: screensForLane(lane).indexOf(screenId) + 1, screensTotal,
          });
          const res = await invokeValidated(m, instruction, record);
          arrays.push(res.findings.map((f) => ({ ...f, engine: m.name })));
        }
      }
    }
    pulse(caseId, 'saving');
    const result = groundUnion(arrays, chunks);
    agreements += result.agreements;
    dropped += result.dropped;

    // Short tx per screen: findings + the tracker's honest sub-detail.
    await withTenant(tenantId, async (tx) => {
      for (const f of result.grounded) {
        const meta = (f.chunk.metadata ?? {}) as { volume?: string; page?: number; line?: number };
        const q = normalizeQuote(f.quote);
        const siblings = keptByChunk.get(f.chunk.id) ?? [];
        // Same passage as something an earlier screen already grounded?
        const dup = findSamePassage(siblings, f.quote);

        if (dup) {
          dup.seenBy.add(screenId);
          const better = isStrongerFinding(f, dup);
          if (better) {
            dup.category = f.category;
            dup.severity = f.severity;
            dup.confidence = f.confidence;
            dup.screen = screenId;
          }
          // v2 fields on a merge: preservation is a FACT, so the strongest
          // grounded call from any screen wins; dependsOn unions; the
          // winner's develop/harm ride with its text.
          const incoming = structuredFields(f, screenId, chunks);
          const mergedPreserved = strongerPreserved(dup.preserved, incoming.preserved, Boolean(incoming.preservedCite));
          dup.dependsOn = [...new Set([...(dup.dependsOn ?? []), ...(incoming.dependsOn ?? [])])].slice(0, 8);
          if (mergedPreserved !== dup.preserved) { dup.preserved = mergedPreserved; dup.preservedCite = incoming.preservedCite ?? undefined; }
          await tx.finding.update({
            where: { id: dup.id },
            data: {
              screen: dup.screen,
              alsoFoundBy: [...dup.seenBy].filter((sc) => sc !== dup.screen),
              preserved: dup.preserved,
              preservedCite: dup.preservedCite ?? null,
              dependsOn: dup.dependsOn,
              ...(better
                ? {
                    stableKey: sha256(`${f.category}:${f.chunk.id}:${f.quote}`).slice(0, 32),
                    category: f.category,
                    severity: f.severity,
                    confidence: f.confidence,
                    engine: f.engine ?? model.name,
                    partAText: f.partA,
                    partBText: f.partB,
                    harmStandard: incoming.harmStandard,
                    develop: incoming.develop ?? null,
                    vehicle: vehicleFor({ screen: screenId, category: f.category, preserved: dup.preserved, harmStandard: incoming.harmStandard }),
                  }
                : {}),
            },
          });
          mergedAcrossScreens++;
          continue;
        }

        const v2 = structuredFields(f, screenId, chunks);
        const created = await tx.finding.create({
          data: {
            runId: run.id,
            caseId,
            tenantId,
            stableKey: sha256(`${f.category}:${f.chunk.id}:${f.quote}`).slice(0, 32),
            category: f.category,
            severity: f.severity,
            confidence: f.confidence,
            adjudication: 'not_run',
            engine: f.engine ?? model.name,
            screen: screenId,
            ...v2,
            partAText: f.partA,
            partBText: f.partB,
            citations: {
              create: {
                documentId: f.chunk.documentId,
                volume: meta.volume ?? null,
                page: meta.page ?? null,
                line: meta.line ?? null,
                chunkId: f.chunk.id,
                excerptHash: sha256(f.chunk.content),
                excerpt: f.quote,
              },
            },
          },
          select: { id: true },
        });
        siblings.push({
          id: created.id, quote: q, category: f.category, severity: f.severity,
          confidence: f.confidence, screen: screenId, seenBy: new Set([screenId]),
          preserved: v2.preserved, preservedCite: v2.preservedCite ?? undefined, dependsOn: v2.dependsOn,
        });
        keptByChunk.set(f.chunk.id, siblings);
        persisted++;
      }
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'screen.completed',
        payload: {
          screen: screenId === 'plea_lane' ? 'plea_lane' : screenId,
          findingCount: result.grounded.length + result.dropped,
          pagesAnalyzed: chunks.length,
        },
        actor: 'pipeline',
      });
    });
  }

  // Short tx 3: adjudication + hand-off to QA.
  await withTenant(tenantId, async (tx) => {
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'stage.entered', payload: { status: 'ADJUDICATING' },
      actor: 'pipeline', transition: 'ADJUDICATING',
    });
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'adjudication.completed',
      payload: { agreements, disagreements: 0 }, // union model: agreement, never veto
      actor: 'pipeline',
    });
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'stage.entered', payload: { status: 'QA_REVIEW' },
      actor: 'pipeline', transition: 'QA_REVIEW',
    });
    await tx.analysisRun.update({ where: { id: run.id }, data: { completedAt: new Date() } });
  });

  return { runId: run.id, screensRun: screensForLane(lane).length, findingsPersisted: persisted, droppedUngrounded: dropped, mergedAcrossScreens };
}

/**
 * FR-7 re-verification: every citation re-fetches its chunk and compares
 * hashes; a mismatch drops the finding and reports it. Used at QA approval
 * and at every customer render — a report can never show text QA didn't see.
 */
export async function verifyFindings(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  findingIds: string[]
): Promise<{ verified: string[]; failed: string[] }> {
  const verified: string[] = [];
  const failed: string[] = [];
  for (const id of findingIds) {
    const citations = await tx.findingCitation.findMany({ where: { findingId: id } });
    let ok = citations.length > 0;
    for (const c of citations) {
      const chunk = await tx.documentChunk.findUnique({ where: { id: c.chunkId } });
      if (!chunk || sha256(chunk.content) !== c.excerptHash || !quoteGrounds(chunk.content, c.excerpt)) {
        ok = false;
        break;
      }
    }
    (ok ? verified : failed).push(id);
  }
  return { verified, failed };
}
