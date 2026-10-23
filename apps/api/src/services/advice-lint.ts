/**
 * Advice-language lint (UPL review 2026-10-23, finding E3, recommendation
 * 11). The product describes what a court record contains; it never
 * advises, never tells anyone what to file or when, never predicts an
 * outcome and never addresses the family or the defendant directly. This
 * lint catches the wording that crosses that line in the text the model
 * returns, so a case whose family text advises is held for a human instead
 * of auto-delivering.
 *
 * Two audiences:
 *  - `family`  — Part A. Second-person imperatives and the merit, timing,
 *                remedy and outcome phrases are all hits. "A lawyer can tell
 *                you" is allowed: it sends the reader to counsel without
 *                telling them what counsel will say.
 *  - `counsel` — Part B. Strickland and preservation language ("counsel
 *                should have objected", "deficient performance", "harm
 *                standard") is the lawyer's vocabulary and passes. Only
 *                advice directed at a non-lawyer ("the defendant should",
 *                "you should") and outcome predictions ("will prevail",
 *                "will be granted") are hits.
 *
 * Deterministic and dependency-free, like readability.ts. Indexes are
 * character offsets into the text as given.
 */

export type LintAudience = 'family' | 'counsel';

export interface AdviceLintHit {
  /** The matched text, as it appears in the input. */
  phrase: string;
  /** Character offset of the match. */
  index: number;
}

export interface AdviceLintResult {
  ok: boolean;
  hits: AdviceLintHit[];
}

/** Family text: the literal phrases of the review's recommendation 11. */
const FAMILY_PHRASES: RegExp[] = [
  /\byou should contact\b/gi,
  /\bshould\b/gi,
  /\bmust file\b/gi,
  /\bfile an?\b/gi,
  /\byou qualify\b/gi,
  /\byou (?:are|'re|’re) eligible\b/gi,
  /\bviable\b/gi,
  /\bwinnable\b/gi,
  /\bmeritorious\b/gi,
  /\byou have (?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirty|sixty|ninety|a few|about \d+|roughly \d+) days?\b/gi,
  /\byour deadline\b/gi,
  /\bwill win\b/gi,
  /\bwill lose\b/gi,
  /\bcannot win\b/gi,
  /\bcan(?:'|’)t win\b/gi,
  /\bgrounds for relief\b/gi,
];

/**
 * Second-person imperatives: a sentence that opens with a verb aimed at the
 * reader. The verb list is the one that shows up in advice ("File a writ",
 * "Contact a lawyer", "Hire counsel", "Do not wait"); a descriptive sentence
 * opens with a noun ("The record shows…", "Counsel did not object…").
 */
const IMPERATIVE_VERBS =
  'file|contact|call|hire|retain|consult|ask|talk|speak|get|take|bring|apply|submit|seek|act|petition|demand|insist|write|send|gather|collect|find|look|check|make sure|be sure|remember|hurry|do not|don(?:\'|’)t|never|always|start|begin|stop|avoid|prepare';
const IMPERATIVE_SENTENCE = new RegExp(`(^|[.!?]\\s+|[:;—]\\s+|\\n\\s*)((?:please\\s+)?(?:${IMPERATIVE_VERBS})\\b)`, 'gi');

/** Counsel text: advice aimed past the lawyer at the person, and outcome predictions. */
const COUNSEL_PHRASES: RegExp[] = [
  /\bthe (?:defendant|applicant|petitioner|appellant|client|family) should\b/gi,
  /\byou should\b/gi,
  /\byou must\b/gi,
  /\bwill prevail\b/gi,
  /\bwill be granted\b/gi,
  /\bwill be denied\b/gi,
  /\bwill succeed\b/gi,
  /\bwill fail\b/gi,
  /\bwill be reversed\b/gi,
  /\bwill win\b/gi,
  /\bwill lose\b/gi,
  /\bis certain to\b/gi,
];

/** Wording the family lint allows even though it names the reader: a hand-off to counsel, not advice. */
const FAMILY_ALLOWED: RegExp[] = [/\ba lawyer can tell you\b/gi, /\ban attorney can tell you\b/gi];

function collect(text: string, patterns: RegExp[]): AdviceLintHit[] {
  const hits: AdviceLintHit[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      hits.push({ phrase: m[0], index: m.index });
    }
  }
  return hits;
}

function imperatives(text: string): AdviceLintHit[] {
  const hits: AdviceLintHit[] = [];
  IMPERATIVE_SENTENCE.lastIndex = 0;
  for (const m of text.matchAll(IMPERATIVE_SENTENCE)) {
    if (m.index === undefined) continue;
    const lead = m[1].length;
    hits.push({ phrase: m[2], index: m.index + lead });
  }
  return hits;
}

/** Drops hits inside an allowed phrase, then overlapping hits (the longest at each position wins). */
function tidy(text: string, hits: AdviceLintHit[], allowed: RegExp[]): AdviceLintHit[] {
  const allowedSpans = collect(text, allowed).map((h) => [h.index, h.index + h.phrase.length] as const);
  const kept = hits
    .filter((h) => !allowedSpans.some(([a, b]) => h.index >= a && h.index + h.phrase.length <= b))
    .sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length);
  const out: AdviceLintHit[] = [];
  let end = -1;
  for (const h of kept) {
    if (h.index < end) continue;
    out.push(h);
    end = h.index + h.phrase.length;
  }
  return out;
}

export function lintAdvice(text: string, opts: { audience: LintAudience }): AdviceLintResult {
  const input = text ?? '';
  const hits =
    opts.audience === 'family'
      ? tidy(input, [...collect(input, FAMILY_PHRASES), ...imperatives(input)], FAMILY_ALLOWED)
      : tidy(input, collect(input, COUNSEL_PHRASES), []);
  return { ok: hits.length === 0, hits };
}

/** What a Finding row stores (`Finding.lintFlags`); null when both parts are clean. */
export interface FindingLintFlags {
  /** True when the family text (Part A) has a hit — the auto-QA hold condition. */
  adviceLintHit: boolean;
  partA: AdviceLintHit[];
  partB: AdviceLintHit[];
}

/** Lints both parts of a finding for storage; null when nothing was found. */
export function lintFinding(partA: string, partB: string): FindingLintFlags | null {
  const a = lintAdvice(partA, { audience: 'family' });
  const b = lintAdvice(partB, { audience: 'counsel' });
  if (a.ok && b.ok) return null;
  return { adviceLintHit: !a.ok, partA: a.hits, partB: b.hits };
}
