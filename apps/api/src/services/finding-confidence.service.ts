import type { withTenant } from '@hg/database';

/**
 * Report snapshots written before 2026-09-12 carry no confidence. Every
 * render reads it from the Finding rows the snapshot points at (the same
 * rows FR-7 re-verifies), so old reports show the weight line too.
 */
export async function attachConfidence<T extends { id: string; confidence?: number }>(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  findings: T[]
): Promise<Array<T & { confidence?: number }>> {
  const missing = findings.filter((f) => typeof f.confidence !== 'number').map((f) => f.id);
  if (missing.length === 0) return findings;
  const rows = await tx.finding.findMany({ where: { id: { in: missing } }, select: { id: true, confidence: true } });
  const byId = new Map(rows.map((r) => [r.id, r.confidence]));
  return findings.map((f) => (typeof f.confidence === 'number' ? f : { ...f, confidence: byId.get(f.id) }));
}
