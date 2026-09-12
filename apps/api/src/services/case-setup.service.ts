import prisma, { withTenant } from '@hg/database';
import { CaseFactsSchema, checklistTemplate, type CaseFacts } from '@hg/case-lifecycle';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];

/**
 * "Never ask twice" at purchase (PO, 2026-09-12: "when re-running it should
 * not prompt for the case information again if we already have it on file").
 * A paid re-run never asks — it reopens the same case. A SECOND purchase on
 * the same account creates a new case; these helpers carry the earlier
 * case's county, year and dates over, seed the checklist when every
 * shaping answer is known, and let the success page skip the interview.
 * Everything carried over is labelled and editable on the case page.
 */

export interface CarriedFacts {
  fromCaseId: string;
  county?: string;
  convictionYear?: number;
  trialDays?: number;
  judgmentDate?: string;
}

/** The buyer's most recent other case with a county on file, if any. */
export async function carryOverFacts(userId: string, excludeCaseId?: string): Promise<CarriedFacts | null> {
  const access = await prisma.caseAccess.findMany({
    where: { userId, role: 'ADMIN', ...(excludeCaseId ? { caseId: { not: excludeCaseId } } : {}) },
    select: { case: { select: { id: true, county: true, convictionYear: true, facts: true, deadlineFacts: true, createdAt: true } } },
  });
  const prior = access
    .map((a) => a.case)
    .filter((c) => c.county || c.convictionYear)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!prior) return null;
  const f = CaseFactsSchema.safeParse(prior.facts ?? {});
  const facts: CaseFacts = f.success ? f.data : {};
  const deadline = (prior.deadlineFacts ?? {}) as { judgmentDate?: string };
  const out: CarriedFacts = { fromCaseId: prior.id };
  const county = prior.county ?? facts.county;
  const year = prior.convictionYear ?? facts.convictionYear;
  if (county) out.county = county;
  if (year) out.convictionYear = year;
  if (facts.trialDays != null) out.trialDays = facts.trialDays;
  const jd = deadline.judgmentDate ?? facts.judgmentDate;
  if (jd) out.judgmentDate = jd;
  return out;
}

/** The interview still has something to ask. */
export function interviewNeeded(kase: { lane?: string | null; facts?: unknown }): boolean {
  const f = CaseFactsSchema.safeParse(kase.facts ?? {});
  const facts: CaseFacts = f.success ? f.data : {};
  return !kase.lane || !facts.county || !facts.convictionYear || !facts.appeal;
}

/** Create the template items the case does not have yet; returns the total count. */
export async function seedChecklist(
  tx: Tx,
  kase: { id: string; lane?: string | null; subsequentWrit: boolean },
  hadAppeal: boolean
): Promise<number> {
  const existing = await tx.checklistItem.findMany({ where: { caseId: kase.id }, select: { kind: true } });
  const have = new Set(existing.map((i) => i.kind));
  const items = checklistTemplate({
    lane: (kase.lane ?? 'TRIAL') as 'TRIAL' | 'PLEA',
    subsequentWrit: kase.subsequentWrit,
    hadAppeal,
  }).filter((i) => !have.has(i.kind));
  if (items.length) {
    await tx.checklistItem.createMany({ data: items.map((i) => ({ caseId: kase.id, kind: i.kind, label: i.label, howToKey: i.howToKey })) });
  }
  return tx.checklistItem.count({ where: { caseId: kase.id } });
}
