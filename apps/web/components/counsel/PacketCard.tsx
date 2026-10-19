'use client'

/**
 * The packet download once the case is READY or DELIVERED. The PDF lives at
 * GET /counsel/matters/:caseId/packet.pdf (workstream E2); this card probes
 * packet.json first and, while that route does not exist (404 locally
 * before E2 lands), says "Packet arrives when analysis completes" rather
 * than offering a dead link. The re-run entry mirrors the family flow's
 * $99 re-run; a counsel checkout for it is not built, so it is arranged by
 * email.
 */
import { useEffect, useState } from 'react'
import { BRAND } from '@hg/case-lifecycle'
import { counselPacketPdfUrl, getCounselPacketSections } from '@/lib/api'
import { RERUN_PRICE } from '@/lib/content/professional'

export default function PacketCard({ caseId, title }: { caseId: string; title: string }) {
  const [state, setState] = useState<'checking' | 'ready' | 'pending'>('checking')
  useEffect(() => {
    let alive = true
    getCounselPacketSections(caseId)
      .then((r) => alive && setState(r.ok ? 'ready' : 'pending'))
      .catch(() => alive && setState('pending'))
    return () => {
      alive = false
    }
  }, [caseId])

  return (
    <section data-testid="packet-card" className="rounded-xl border-2 border-db-accent bg-db-surface p-5">
      <h2 className="font-db-serif text-xl font-semibold">The packet</h2>
      {state === 'checking' && <p className="mt-2 text-sm text-db-muted" aria-live="polite">Checking…</p>}
      {state === 'ready' && (
        <div>
          <p className="mt-2 text-[15px] text-db-muted">Part B first, with the inventory, the TRAP clock and the disclosure blocks. Every citation re-verified at render.</p>
          <a href={counselPacketPdfUrl(caseId)} className="mt-4 inline-block rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface" data-testid="packet-download">
            Download the packet (PDF)
          </a>
        </div>
      )}
      {state === 'pending' && (
        <p className="mt-2 text-[15px]" data-testid="packet-pending">
          Packet arrives when analysis completes.
        </p>
      )}
      <p className="mt-4 border-t border-db-line pt-3 text-sm text-db-muted" data-testid="rerun-entry">
        New volumes since this packet? A re-run with the new documents is ${RERUN_PRICE}.{' '}
        <a href={`mailto:${BRAND.email}?subject=${encodeURIComponent(`Re-run request — ${title}`)}`} className="underline">Request a re-run</a> and we arrange it by email.
      </p>
    </section>
  )
}
