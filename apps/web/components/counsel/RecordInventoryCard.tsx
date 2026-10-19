/**
 * The record inventory (workstream D, GET /cases/:id/inventory) in counsel's
 * words: the volumes that are here with their page counts, the volumes the
 * numbering says are missing, files nobody has labelled, the metered pages
 * and the bucket the meter set.
 */
import { BUCKET_LABEL } from '@/lib/counsel'

export type VolumeKind = 'REPORTER' | 'CLERK' | 'EXHIBIT' | 'UNKNOWN'
export interface InventoryView {
  volumes: Array<{ kind: VolumeKind; pages: number; ocrConfidence: number | null; docs: Array<{ id: string; filename: string; label: string | null; index: number | null; count: number | null; pages: number; digitised: boolean; confirmed: boolean }> }>
  missing: Array<{ kind: VolumeKind; index: number; count: number | null; label: string }>
  unknownCount: number
  meteredPages: { reporter: number; clerk: number; exhibit: number; unknown: number; total: number }
  bucket: string | null
  bucketNote?: string
}

export const VOLUME_NAME: Record<VolumeKind, string> = { REPORTER: "Reporter's record", CLERK: "Clerk's record", EXHIBIT: 'Exhibits', UNKNOWN: 'Unlabelled' }

export default function RecordInventoryCard({ inventory }: { inventory: InventoryView }) {
  const present = inventory.volumes.filter((v) => v.docs.length > 0)
  return (
    <section data-testid="record-inventory" className="rounded-xl border border-db-line bg-db-surface p-5">
      <h2 className="font-db-serif text-xl font-semibold">Record inventory</h2>
      <p className="mt-1 text-sm text-db-muted">
        {inventory.meteredPages.reporter.toLocaleString('en-US')} reporter&rsquo;s-record pages
        {inventory.meteredPages.clerk ? ` · ${inventory.meteredPages.clerk.toLocaleString('en-US')} clerk's` : ''}
        {inventory.meteredPages.exhibit ? ` · ${inventory.meteredPages.exhibit.toLocaleString('en-US')} exhibit` : ''}
        {inventory.meteredPages.unknown ? ` · ${inventory.meteredPages.unknown.toLocaleString('en-US')} unlabelled` : ''}
        {' · '}
        <span data-testid="inventory-bucket">{inventory.bucket ? BUCKET_LABEL[inventory.bucket] ?? inventory.bucket : 'bucket not set yet'}</span>
      </p>
      {inventory.bucketNote && <p className="mt-1 text-xs text-db-muted">{inventory.bucketNote}</p>}

      {present.length === 0 ? (
        <p className="mt-3 text-[15px] text-db-muted" data-testid="inventory-empty">No volumes yet. Upload the reporter&rsquo;s record first; the clerk&rsquo;s record and exhibits are metered separately.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {present.map((v) => (
            <li key={v.kind} data-testid={`inventory-${v.kind}`}>
              <p className="text-sm font-semibold">
                {VOLUME_NAME[v.kind]} · {v.pages.toLocaleString('en-US')} pages
                {v.ocrConfidence !== null && <span className="ml-2 text-xs font-normal text-db-muted">OCR confidence {Math.round(v.ocrConfidence * 100)}%</span>}
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-db-muted">
                {v.docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap gap-x-2">
                    <span className="font-db-mono text-xs text-db-ink">{d.label ?? VOLUME_NAME[v.kind]}</span>
                    <span>{d.filename}</span>
                    <span>· {d.pages} pages{d.digitised ? '' : ' (reading)'}{d.confirmed ? '' : ' · label unconfirmed'}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {inventory.missing.length > 0 && (
        <p className="mt-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--db-review)', color: 'var(--db-review)' }} data-testid="inventory-missing">
          Missing by the numbering: {inventory.missing.map((m) => m.label).join(', ')}. The packet will say the record was read without them.
        </p>
      )}
      {inventory.unknownCount > 0 && (
        <p className="mt-2 text-sm text-db-muted" data-testid="inventory-unlabelled">
          {inventory.unknownCount} file{inventory.unknownCount === 1 ? '' : 's'} without a volume label — listed, not dropped; unlabelled pages never move the bucket.
        </p>
      )}
    </section>
  )
}
