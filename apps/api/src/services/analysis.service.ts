import crypto from 'crypto';
import { z } from 'zod';
import { withTenant, appendCaseEvent } from '@hg/database';

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
});
const FindingsResponse = z.object({ findings: z.array(FindingOutput).max(50) });

interface Screen {
  id: 'iac' | 'brady' | 'junk_science' | 'sentencing' | 'plea_lane' | 'voir_dire';
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
  voir_dire: `You are a Texas appellate attorney screening jury selection (voir dire) for juror-bias and preserved-error indicators. Cross-reference every venire member's disclosures against the case principals (victim, witnesses, law enforcement, parties) named in the CASE CONTEXT. Flag: relationships to principals (familial, employment, spouse-of — actual or implied bias, Art. 35.16); bias admissions followed by denied challenges for cause, absent challenges, or conclusory one-question rehabilitation; commitments hostile to rights (silence as guilt, presumption reversal, automatic credibility for officers); Batson indicators; panelists exposed to prejudicial information; truncated individual voir dire. For each flagged panelist, give their number AND trace whether the record shows them struck, excused, or SEATED (seating list and jury polls) — a seated biased juror is the highest-severity outcome.`,
};

const SCREENS_BY_LANE: Record<'TRIAL' | 'PLEA', Screen['id'][]> = {
  TRIAL: ['iac', 'brady', 'junk_science', 'sentencing', 'voir_dire'],
  PLEA: ['plea_lane', 'sentencing'],
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

const OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object: {"findings":[{"category":"<preserved_error|iac|brady|junk_science|sentencing|deadline|appeal_restoration — or a short specific label if none fits>","severity":"dispositive|supportive|background","confidence":0..1,"chunkIndex":<index of the excerpt the finding cites>,"quote":"<VERBATIM text copied from that excerpt>","partA":"<plain English for a family, 8th-grade level, no advice>","partB":"<precise statement for an attorney>"}]}. Severity calibration: "dispositive" = could plausibly justify relief or major posture change on its own (illegal sentence, seated biased juror, suppressed exculpatory evidence); "supportive" = strengthens a claim package but needs companions; "background" = context a lawyer should know. The quote MUST be copied character-for-character from one excerpt. If nothing qualifies, return {"findings":[]}.`;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

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
  return `${prefix}${SCREENS[screenId]}\n${anchors ? `${anchors}\n` : ''}${OUTPUT_INSTRUCTIONS}`;
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

export { SCREENS_BY_LANE };

/** The pre-pass itself — shared by the pipeline and compare-models. */
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

/**
 * Transaction shape (learned the expensive way on the first live run):
 * model calls run OUTSIDE any transaction — a Prisma interactive
 * transaction times out in seconds while a screen takes minutes, which
 * killed persistence after ~$2 of paid model work. Each screen commits its
 * own short transaction, so `screen.completed` events reach the tracker as
 * they happen and a late crash never rolls back earlier screens' work.
 */
export async function runAnalysis(
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
      data: { caseId, tenantId, runNo, modelConfig: { model: model.name, screens: 'v1' } },
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

  // Context pre-pass: outside any transaction, one cached-read call.
  const contextHeader = await buildContextHeader(model, record);
  if (contextHeader) console.log(`[analysis] context header: ${contextHeader.slice(0, 160)}…`);

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
    batchByEngine.set(
      m.name,
      await m.invokeMany(
        SCREENS_BY_LANE[lane].flatMap((screenId) =>
          Array.from({ length: samples }, (_, n) => ({
            key: `${screenId}__${n}`,
            instruction: buildScreenInstruction(screenId, chunks, contextHeader),
          }))
        ),
        record
      )
    );
  }

  let agreements = 0;
  for (const screenId of SCREENS_BY_LANE[lane]) {
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
        const instruction = buildScreenInstruction(screenId, chunks, contextHeader);
        for (let n = 0; n < samples; n++) {
          const res = await invokeValidated(m, instruction, record);
          arrays.push(res.findings.map((f) => ({ ...f, engine: m.name })));
        }
      }
    }
    const result = groundUnion(arrays, chunks);
    agreements += result.agreements;
    dropped += result.dropped;

    // Short tx per screen: findings + the tracker's honest sub-detail.
    await withTenant(tenantId, async (tx) => {
      for (const f of result.grounded) {
        const meta = (f.chunk.metadata ?? {}) as { volume?: string; page?: number; line?: number };
        await tx.finding.create({
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
        });
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

  return { runId: run.id, screensRun: SCREENS_BY_LANE[lane].length, findingsPersisted: persisted, droppedUngrounded: dropped };
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
