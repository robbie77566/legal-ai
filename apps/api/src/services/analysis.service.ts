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
  id: 'iac' | 'brady' | 'junk_science' | 'sentencing' | 'plea_lane';
  system: string;
}

// Condensed from prompt_specifications.md; the full five-screen prompt set
// with statute/registry MCP tools is the M4 remainder.
const SCREENS: Record<Screen['id'], string> = {
  iac: 'You are a senior Texas appellate attorney screening a trial record for ineffective-assistance-of-counsel indicators under Strickland (deficiency AND prejudice). Flag un-objected prejudicial events and failures to investigate.',
  brady:
    'You are a forensic discovery auditor screening for Brady indicators: evidence referenced in testimony that appears absent from disclosure references, and impeachment material.',
  junk_science:
    'You are a forensic-science consultant screening expert testimony for methods now discredited or materially refined (Art. 11.073): bite marks, hair comparison, arson indicators, dog-scent lineups, overstated identification claims.',
  sentencing:
    'You are auditing the judgment and sentence for illegal-sentence indicators: punishment outside the statutory range, enhancement defects, time-credit errors, cumulation-order and deadly-weapon-finding issues.',
  plea_lane:
    'You are screening plea papers for involuntary-plea indicators: missing admonishments, judgment terms that do not match the plea agreement, absent judicial confession, and affirmative misadvice (immigration/Padilla, parole eligibility).',
};

const SCREENS_BY_LANE: Record<'TRIAL' | 'PLEA', Screen['id'][]> = {
  TRIAL: ['iac', 'brady', 'junk_science', 'sentencing'],
  PLEA: ['plea_lane', 'sentencing'],
};

const OUTPUT_INSTRUCTIONS = `Respond with ONLY a JSON object: {"findings":[{"category":"<preserved_error|iac|brady|junk_science|sentencing|deadline|appeal_restoration — or a short specific label if none fits>","severity":"dispositive|supportive|background","confidence":0..1,"chunkIndex":<index of the excerpt the finding cites>,"quote":"<VERBATIM text copied from that excerpt>","partA":"<plain English for a family, 8th-grade level, no advice>","partB":"<precise statement for an attorney>"}]}. The quote MUST be copied character-for-character from one excerpt. If nothing qualifies, return {"findings":[]}.`;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

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

async function invokeValidated(model: AnalysisModel, system: string, user: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await model.invoke(system, user);
    try {
      const jsonText = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
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
      console.warn(`[analysis] response parse attempt ${attempt + 1} failed: ${(e as Error).message.slice(0, 120)}`);
      if (attempt === 1) return { findings: [] }; // bounded: empty screen for QA, never a crash
    }
  }
  return { findings: [] };
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

/** The frozen record prompt — byte-stable across screens (cache prefix). */
export function buildRecord(chunks: AnalysisChunk[]): string {
  return chunks.map((c, i) => `[Excerpt ${i}] ${c.content}`).join('\n\n');
}

export interface ScreenFinding {
  category: string;
  severity: string;
  confidence: number;
  quote: string;
  partA: string;
  partB: string;
  chunk: AnalysisChunk;
}

/**
 * One screen, NO database transaction: model call → zod validation → FR-6
 * grounding hard filter. Shared by the pipeline and the model-comparison
 * eval path (model_evaluation.md §4.1: swaps happen at the model seam,
 * everything else held constant).
 */
export async function executeScreen(
  model: AnalysisModel,
  screenId: keyof typeof SCREENS,
  record: string,
  chunks: AnalysisChunk[]
): Promise<{ grounded: ScreenFinding[]; dropped: number }> {
  const res = await invokeValidated(model, `${SCREENS[screenId]}\n${OUTPUT_INSTRUCTIONS}`, record);
  const grounded: ScreenFinding[] = [];
  let dropped = 0;
  for (const f of res.findings) {
    const chunk = chunks[f.chunkIndex];
    // FR-6: grounding is a hard filter, not a preference.
    if (!chunk || !chunk.content.includes(f.quote)) {
      dropped++;
      continue;
    }
    grounded.push({ ...f, chunk });
  }
  return { grounded, dropped };
}

export { SCREENS_BY_LANE };

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
  model: AnalysisModel
): Promise<AnalysisSummary> {
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

  for (const screenId of SCREENS_BY_LANE[lane]) {
    // Model call: minutes, OUTSIDE any transaction.
    const result = await executeScreen(model, screenId, record, chunks);
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
      payload: { agreements: 0, disagreements: 0 }, // single-engine: not_run
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
      if (!chunk || sha256(chunk.content) !== c.excerptHash || !chunk.content.includes(c.excerpt)) {
        ok = false;
        break;
      }
    }
    (ok ? verified : failed).push(id);
  }
  return { verified, failed };
}
