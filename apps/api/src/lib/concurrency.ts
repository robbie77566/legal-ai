/**
 * Queue-worker concurrency from the environment (2026-09-06).
 *
 * All workers share the api process; on a 512 MB instance two large PDFs
 * parsing at once can hit the ceiling, the platform restarts the process,
 * the queue re-runs the same job — "locked up" from the outside. Small
 * instances turn this down to 1 without a rebuild; bigger ones turn it up.
 */
export function concurrencyFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    console.warn(`[workers] ${name}=${JSON.stringify(raw)} ignored (want an integer 1–16); using ${fallback}`);
    return fallback;
  }
  return n;
}
