import { withTenant, appendCaseEvent, Prisma } from '@hg/database';
import type { VolumeKind } from '@prisma/client';
import { classifyRecord, type RecordBucket } from '@hg/case-lifecycle';

/**
 * Record inventory and volume recognition (persona_rollout_plan.md §4, §5 D —
 * January slice). Every uploaded file carries a volume label: reporter's
 * record, clerk's record, exhibits, or unknown. The uploader says which; a
 * conservative filename heuristic only SUGGESTS a default the family
 * confirms. Cover-page recognition is the March slice and does not live here.
 *
 * The meter (`recomputeMeter`) projects onto the Case what the pricing
 * classifier says: the bucket from reporter's-record pages ALONE, the per-kind
 * billable page counts beside it. Clerk's record and exhibits are metered,
 * never bucketed; unlabelled files are listed and counted, never dropped.
 * The family overage gate in intake.ts still reads total billable pages and
 * is untouched by any of this.
 *
 * All writes run tenant-scoped through withTenant like the other services.
 */

export const VOLUME_KINDS = ['REPORTER', 'CLERK', 'EXHIBIT', 'UNKNOWN'] as const satisfies readonly VolumeKind[];
/** The kinds that can be a numbered volume. */
const NUMBERED: readonly VolumeKind[] = ['REPORTER', 'CLERK', 'EXHIBIT'];

export interface VolumeSuggestion {
  kind: VolumeKind;
  index: number | null;
  count: number | null;
  label: string | null;
}

export interface VolumeInput {
  kind: VolumeKind;
  index?: number | null;
  count?: number | null;
}

export class VolumeInputError extends Error {}

/** "RR vol. 3 of 7", "CR vol. 2", "Exhibits", null for UNKNOWN. */
export function volumeLabel(kind: VolumeKind, index: number | null, count: number | null): string | null {
  const base = kind === 'REPORTER' ? 'RR' : kind === 'CLERK' ? 'CR' : kind === 'EXHIBIT' ? 'Exhibits' : null;
  if (!base) return null;
  if (index == null) return kind === 'REPORTER' ? "Reporter's record" : kind === 'CLERK' ? "Clerk's record" : 'Exhibits';
  return count != null ? `${base} vol. ${index} of ${count}` : `${base} vol. ${index}`;
}

/**
 * Normalises and validates a volume: UNKNOWN carries no position; a count
 * below the index is nonsense (refused on input, dropped on a suggestion).
 */
export function normalizeVolume(v: VolumeInput): { kind: VolumeKind; index: number | null; count: number | null; label: string | null } {
  if (!VOLUME_KINDS.includes(v.kind)) throw new VolumeInputError('Unknown volume kind');
  const okInt = (n: number | null | undefined) => n == null || (Number.isInteger(n) && n >= 1 && n <= 999);
  if (!okInt(v.index) || !okInt(v.count)) throw new VolumeInputError('Volume numbers must be whole numbers from 1 to 999');
  const numbered = NUMBERED.includes(v.kind);
  const index = numbered ? v.index ?? null : null;
  const count = numbered ? v.count ?? null : null;
  if (index != null && count != null && index > count) throw new VolumeInputError('The volume number cannot be higher than the number of volumes');
  return { kind: v.kind, index, count, label: volumeLabel(v.kind, index, count) };
}

/**
 * The conservative filename heuristic. An explicit word names the kind
 * ("RR", "reporter", "transcript", "vol" → reporter's record; "CR", "clerk"
 * → clerk's record; "exhibit", "ex.", "exh" → exhibits); "3 of 7", "vol 3"
 * give the position. "CR" followed by a long number is a cause number, not
 * the clerk's record. An exhibit word beside a reporter word is an exhibit
 * volume, metered as exhibits (plan §4). Anything else is UNKNOWN with no
 * position — a split scan's "1 of 3" is not a volume.
 */
export function suggestVolume(filename: string): VolumeSuggestion {
  const base = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  const s = base
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const reporter = /\brr\b|\breporter|\btranscript/.test(s);
  const clerk = /\bclerk|\bcr\b(?!\s*\d{4,})/.test(s);
  const exhibit = /\bexhibits?\b|\bexh?\b\.?\s*\d|\bex\.(?=\s|$)/.test(s);
  const hasVol = /\bvol(?:ume)?s?\b/.test(s);

  let kind: VolumeKind = 'UNKNOWN';
  if (exhibit) kind = 'EXHIBIT';
  else if (reporter) kind = 'REPORTER';
  else if (clerk) kind = 'CLERK';
  else if (hasVol) kind = 'REPORTER';
  if (kind === 'UNKNOWN') return { kind, index: null, count: null, label: null };

  let index: number | null = null;
  let count: number | null = null;
  const ofM = /(?:\bvol(?:ume)?s?\.?\s*|\bv\.?\s*)?(\d{1,3})\s*(?:of|\/)\s*(\d{1,3})\b/.exec(s);
  const volN = /\bvol(?:ume)?s?\.?\s*(\d{1,3})\b/.exec(s);
  if (ofM) {
    index = Number(ofM[1]);
    count = Number(ofM[2]);
  } else if (volN) {
    index = Number(volN[1]);
  }
  if (index != null && (index < 1 || index > 999)) index = null;
  if (count != null && (index == null || count < index || count > 999)) count = null;
  return { kind, index, count, label: volumeLabel(kind, index, count) };
}

export interface MissingVolume {
  kind: VolumeKind;
  index: number;
  count: number | null;
  label: string;
}

/** Gaps in the index sequence per numbered kind: a declared count or the highest index sets the range. */
export function missingVolumes(docs: Array<{ kind: string; index: number | null; count: number | null }>): MissingVolume[] {
  const out: MissingVolume[] = [];
  for (const kind of NUMBERED) {
    const indexed = docs.filter((d) => d.kind === kind && d.index != null);
    if (indexed.length === 0) continue;
    const declared = Math.max(0, ...indexed.map((d) => d.count ?? 0));
    const highest = Math.max(...indexed.map((d) => d.index as number));
    const range = Math.max(declared, highest);
    const have = new Set(indexed.map((d) => d.index));
    for (let i = 1; i <= range; i++) {
      if (have.has(i)) continue;
      const count = declared > 0 ? declared : null;
      out.push({ kind, index: i, count, label: volumeLabel(kind, i, count) as string });
    }
  }
  return out;
}

export interface InventoryDoc {
  id: string;
  filename: string;
  kind: VolumeKind;
  label: string | null;
  index: number | null;
  count: number | null;
  /** Billable (deduplicated) pages — 0 until digitised. */
  pages: number;
  duplicatesIgnored: number;
  digitised: boolean;
  /** Mean OCR confidence over its pages, null until digitised. */
  ocrConfidence: number | null;
  confirmed: boolean;
}

export interface InventoryVolume {
  kind: VolumeKind;
  docs: InventoryDoc[];
  pages: number;
  ocrConfidence: number | null;
}

export interface MeteredPages {
  reporter: number;
  clerk: number;
  exhibit: number;
  unknown: number;
}

export interface Inventory {
  volumes: InventoryVolume[];
  missing: MissingVolume[];
  unknownCount: number;
  meteredPages: MeteredPages & { total: number };
  bucket: RecordBucket;
  bucketNote: string | null;
}

type Tx = Prisma.TransactionClient;

/** The inventory read inside a tenant-scoped transaction (shared by the read and the recompute). */
async function buildInventory(tx: Tx, caseId: string): Promise<{ inventory: Inventory; docs: InventoryDoc[] }> {
  const rows = await tx.document.findMany({
    where: { caseId, quarantined: false },
    orderBy: [{ volumeIndex: 'asc' }, { filename: 'asc' }],
    select: { id: true, filename: true, volumeKind: true, volumeLabel: true, volumeIndex: true, volumeCount: true, volumeConfirmed: true },
  });
  const ids = rows.map((r) => r.id);
  const [all, billable] = ids.length
    ? await Promise.all([
        tx.documentPage.groupBy({ by: ['documentId'], where: { documentId: { in: ids } }, _count: { _all: true }, _avg: { ocrConfidence: true } }),
        tx.documentPage.groupBy({ by: ['documentId'], where: { documentId: { in: ids }, billable: true }, _count: { _all: true } }),
      ])
    : [[], []];
  const allOf = new Map(all.map((g) => [g.documentId, g]));
  const billableOf = new Map(billable.map((g) => [g.documentId, g._count._all]));

  const docs: InventoryDoc[] = rows.map((r) => {
    const total = allOf.get(r.id)?._count._all ?? 0;
    const pages = billableOf.get(r.id) ?? 0;
    return {
      id: r.id,
      filename: r.filename,
      kind: r.volumeKind,
      label: r.volumeLabel ?? volumeLabel(r.volumeKind, r.volumeIndex, r.volumeCount),
      index: r.volumeIndex,
      count: r.volumeCount,
      pages,
      duplicatesIgnored: total - pages,
      digitised: total > 0,
      ocrConfidence: allOf.get(r.id)?._avg.ocrConfidence ?? null,
      confirmed: r.volumeConfirmed,
    };
  });

  const volumes: InventoryVolume[] = VOLUME_KINDS.map((kind) => {
    const mine = docs.filter((d) => d.kind === kind);
    // Page-weighted mean, so a 400-page clean volume outweighs a 2-page blurry one.
    const weighted = mine.filter((d) => d.ocrConfidence != null && d.digitised);
    const weight = weighted.reduce((s, d) => s + d.pages + d.duplicatesIgnored, 0);
    const ocrConfidence = weight > 0
      ? weighted.reduce((s, d) => s + (d.ocrConfidence as number) * (d.pages + d.duplicatesIgnored), 0) / weight
      : null;
    return { kind, docs: mine, pages: mine.reduce((s, d) => s + d.pages, 0), ocrConfidence };
  });
  const pagesOf = (kind: VolumeKind) => volumes.find((v) => v.kind === kind)?.pages ?? 0;
  const metered: MeteredPages = { reporter: pagesOf('REPORTER'), clerk: pagesOf('CLERK'), exhibit: pagesOf('EXHIBIT'), unknown: pagesOf('UNKNOWN') };
  const classified = classifyRecord({ reporterPages: metered.reporter, clerkPages: metered.clerk, exhibitPages: metered.exhibit });
  const unknownCount = docs.filter((d) => d.kind === 'UNKNOWN').length;

  let bucketNote: string | null = null;
  if (metered.reporter === 0 && metered.clerk + metered.exhibit + metered.unknown > 0) {
    bucketNote = "No reporter's-record pages are labelled yet, so the record sits in the SHORT bucket. The bucket is set from the reporter's record alone; the clerk's record and exhibits are metered separately.";
  } else if (metered.unknown > 0) {
    bucketNote = `${metered.unknown.toLocaleString('en-US')} page${metered.unknown === 1 ? ' is' : 's are'} in files not yet labelled; they count toward the bucket only once they are.`;
  }

  return {
    docs,
    inventory: {
      volumes,
      missing: missingVolumes(docs),
      unknownCount,
      meteredPages: { ...metered, total: classified.meteredPages.total + metered.unknown },
      bucket: classified.bucket,
      bucketNote,
    },
  };
}

/** Writes the projection onto the Case and the per-document OCR mean. */
async function recomputeMeterIn(tx: Tx, caseId: string): Promise<Inventory> {
  const { inventory, docs } = await buildInventory(tx, caseId);
  const { total: _total, ...meteredPages } = inventory.meteredPages;
  await tx.case.update({
    where: { id: caseId },
    data: { recordBucket: inventory.bucket, meteredPages: meteredPages as Prisma.InputJsonObject, inventoryAt: new Date() },
  });
  for (const d of docs) {
    if (d.digitised) await tx.document.update({ where: { id: d.id }, data: { ocrConfidence: d.ocrConfidence } });
  }
  return inventory;
}

/** The echo-back inventory (read-only). */
export async function inventory(caseId: string, tenantId: string): Promise<Inventory> {
  return withTenant(tenantId, async (tx) => (await buildInventory(tx, caseId)).inventory);
}

/**
 * Recompute and store the meter. Called after every upload complete,
 * document removal, volume change and when digitisation finishes. Callers
 * on a hot path wrap it in `.catch` — a meter hiccup never fails an upload.
 */
export async function recomputeMeter(caseId: string, tenantId: string): Promise<Inventory> {
  return withTenant(tenantId, (tx) => recomputeMeterIn(tx, caseId));
}

/** Fire-and-forget variant for the paths that must not fail on the meter. */
export function recomputeMeterSafe(caseId: string, tenantId: string): Promise<void> {
  return recomputeMeter(caseId, tenantId).then(
    () => undefined,
    (e: unknown) => console.warn(`[inventory] meter recompute failed (case ${caseId}): ${(e as Error).message?.slice(0, 200)}`)
  );
}

/** The Document create/update fields for a volume. */
export function volumeFields(v: VolumeInput, confirmed: boolean) {
  const n = normalizeVolume(v);
  return { volumeKind: n.kind, volumeIndex: n.index, volumeCount: n.count, volumeLabel: n.label, volumeConfirmed: confirmed };
}

export interface SetVolumeResult {
  document: { id: string; volumeKind: VolumeKind; volumeLabel: string | null; volumeIndex: number | null; volumeCount: number | null; volumeConfirmed: boolean };
  inventory: Inventory;
}

/**
 * The uploader (or a later editor) says which volume a file is. Null when
 * the document is not in this case (RLS hides other tenants' cases
 * entirely, so the route answers 404 either way). Throws VolumeInputError
 * on a nonsense position.
 */
export async function setVolume(
  caseId: string,
  tenantId: string,
  docId: string,
  v: VolumeInput & { confirmed: boolean },
  actor: string
): Promise<SetVolumeResult | null> {
  const fields = volumeFields(v, v.confirmed);
  return withTenant(tenantId, async (tx) => {
    const doc = await tx.document.findFirst({ where: { id: docId, caseId }, select: { id: true } });
    if (!doc) return null;
    const updated = await tx.document.update({
      where: { id: docId },
      data: fields,
      select: { id: true, volumeKind: true, volumeLabel: true, volumeIndex: true, volumeCount: true, volumeConfirmed: true },
    });
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'doc.volume_set',
      payload: {
        documentId: docId, kind: fields.volumeKind,
        ...(fields.volumeIndex != null ? { index: fields.volumeIndex } : {}),
        ...(fields.volumeCount != null ? { count: fields.volumeCount } : {}),
        confirmed: v.confirmed,
      },
      actor,
    });
    const inv = await recomputeMeterIn(tx, caseId);
    return { document: updated, inventory: inv };
  });
}
