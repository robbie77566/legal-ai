/**
 * Eval harness scorer (M4/M7 launch gate — model_evaluation.md §4).
 *
 * Scores a persisted AnalysisRun's findings against an attorney ledger:
 *  - RECALL over `mustFind` entries (the gating metric — recall-first by
 *    design: QA filters noise, but a missed claim never reaches QA).
 *  - PRECISION + severity calibration over transcribed packet `verdicts`
 *    (available once the reviewing attorney's packet comes back).
 *
 * Matching is deliberately dumb and auditable: case-insensitive substring
 * terms over category + partA + partB, plus an optional citation-page
 * window. No model calls — deterministic, CI-safe, replayable.
 */

export interface LedgerMustFind {
  id: string;
  note: string;
  allOf: string[];
  anyOf?: string[];
  pageWindow?: { min: number; max: number };
  minSeverity?: 'dispositive' | 'supportive' | 'background';
}

export interface LedgerVerdict {
  findingRef: string; // Finding.id suffix as printed in the packet
  verdict: 'agree' | 'partly' | 'disagree';
  severityOverride?: string;
}

export interface EvalLedger {
  case: string;
  caseTitle: string;
  provenance: string;
  mustFind: LedgerMustFind[];
  verdicts: LedgerVerdict[];
}

export interface ScorableFinding {
  id: string;
  category: string;
  severity: string;
  confidence: number;
  partAText: string;
  partBText: string;
  pages: number[];
}

const SEV_RANK: Record<string, number> = { dispositive: 0, supportive: 1, background: 2 };

function matches(f: ScorableFinding, m: LedgerMustFind): boolean {
  const hay = `${f.category}\n${f.partAText}\n${f.partBText}`.toLowerCase();
  if (!m.allOf.every((t) => hay.includes(t.toLowerCase()))) return false;
  if (m.anyOf && !m.anyOf.some((t) => hay.includes(t.toLowerCase()))) return false;
  if (m.pageWindow && !f.pages.some((p) => p >= m.pageWindow!.min && p <= m.pageWindow!.max)) return false;
  if (m.minSeverity && SEV_RANK[f.severity] > SEV_RANK[m.minSeverity]) return false;
  return true;
}

export interface EvalScorecard {
  case: string;
  mustFindTotal: number;
  found: { id: string; by: string[] }[];
  missed: { id: string; note: string }[];
  recall: number;
  precision: number | null; // null until verdicts exist
  severityAgreement: number | null;
  verdictCounts: { agree: number; partly: number; disagree: number };
}

export function scoreRun(ledger: EvalLedger, findings: ScorableFinding[]): EvalScorecard {
  const found: EvalScorecard['found'] = [];
  const missed: EvalScorecard['missed'] = [];
  for (const m of ledger.mustFind) {
    const hits = findings.filter((f) => matches(f, m));
    if (hits.length > 0) found.push({ id: m.id, by: hits.map((h) => h.id.slice(-6)) });
    else missed.push({ id: m.id, note: m.note });
  }

  const counts = { agree: 0, partly: 0, disagree: 0 };
  let sevMatches = 0;
  let sevJudged = 0;
  for (const v of ledger.verdicts) {
    counts[v.verdict]++;
    if (v.verdict !== 'disagree') {
      sevJudged++;
      if (!v.severityOverride) sevMatches++;
    }
  }
  const judged = counts.agree + counts.partly + counts.disagree;

  return {
    case: ledger.case,
    mustFindTotal: ledger.mustFind.length,
    found,
    missed,
    recall: ledger.mustFind.length === 0 ? 1 : found.length / ledger.mustFind.length,
    precision: judged === 0 ? null : (counts.agree + counts.partly) / judged,
    severityAgreement: sevJudged === 0 ? null : sevMatches / sevJudged,
    verdictCounts: counts,
  };
}
