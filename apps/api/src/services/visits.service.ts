import prisma, { Prisma } from '@hg/database';

/**
 * Visits for the admin's Accounts page. A visit is a run of signed-in
 * activity: the web app posts /me/visit on every page and every minute
 * while the tab is visible, and a gap longer than VISIT_GAP_MS starts a new
 * visit. Time on site is lastSeenAt − startedAt, so a single-page visit that
 * never sends a second beat counts as ~0 — the same convention analytics
 * products use for a bounce.
 */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** Does activity at `now` continue the visit last seen at `lastSeenAt`? */
export function isSameVisit(lastSeenAt: Date, now: Date, gapMs = VISIT_GAP_MS): boolean {
  return now.getTime() - lastSeenAt.getTime() < gapMs;
}

export async function touchVisit(
  userId: string,
  tenantId: string,
  opts: { pageview: boolean },
  now = new Date()
): Promise<{ visitId: string; started: boolean }> {
  const last = await prisma.userVisit.findFirst({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
  if (last && isSameVisit(last.lastSeenAt, now)) {
    await prisma.userVisit.update({
      where: { id: last.id },
      data: { lastSeenAt: now, ...(opts.pageview ? { pageViews: { increment: 1 } } : {}) },
    });
    return { visitId: last.id, started: false };
  }
  const v = await prisma.userVisit.create({ data: { userId, tenantId, startedAt: now, lastSeenAt: now } });
  return { visitId: v.id, started: true };
}

export interface VisitStats {
  visits: number;
  /** Mean visit length in seconds; null when there are no visits. */
  avgSeconds: number | null;
  lastSeenAt: Date | null;
}

/** Per-user rollup for a list of users — one query, not one per row. */
export async function visitSummary(userIds: string[]): Promise<Map<string, VisitStats>> {
  const out = new Map<string, VisitStats>();
  if (userIds.length === 0) return out;
  const rows = await prisma.$queryRaw<Array<{ userId: string; visits: bigint; avgSeconds: number | null; lastSeenAt: Date | null }>>`
    SELECT "userId",
           COUNT(*)::bigint AS "visits",
           AVG(EXTRACT(EPOCH FROM ("lastSeenAt" - "startedAt")))::float AS "avgSeconds",
           MAX("lastSeenAt") AS "lastSeenAt"
    FROM "UserVisit"
    WHERE "userId" IN (${Prisma.join(userIds)})
    GROUP BY "userId"`;
  for (const r of rows) out.set(r.userId, { visits: Number(r.visits), avgSeconds: r.avgSeconds, lastSeenAt: r.lastSeenAt });
  return out;
}
