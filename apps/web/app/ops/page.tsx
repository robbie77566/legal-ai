'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * Ops console (US-9, OPS-1..7) — Industrial Authority ADMIN surface.
 * Queue with stall/hold chips → case timeline → audited one-click actions:
 * honest delay, disclosure-archive export, refund, scoped deletion.
 */

interface QueueRow {
  id: string
  title: string
  status: string
  lane: string | null
  daysInStage: number
  stalled: boolean
  ocrHalt: boolean
  delayOurs: boolean
  subsequentWrit: boolean
}
interface TimelineEvent {
  id: string
  type: string
  payload: Record<string, unknown>
  actor: string
  createdAt: string
}

export default function OpsConsole() {
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [selected, setSelected] = useState<QueueRow | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [notice, setNotice] = useState('')
  const [delayDate, setDelayDate] = useState('')

  const loadQueue = useCallback(async () => {
    const res = await apiFetch('/ops/queue')
    if (res.ok) setQueue(await res.json())
  }, [])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const open = async (row: QueueRow) => {
    setSelected(row)
    setNotice('')
    const res = await apiFetch(`/ops/cases/${row.id}/timeline`)
    if (res.ok) setTimeline(await res.json())
  }

  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (!selected) return
    if (confirmText && !window.confirm(confirmText)) return
    const res = await apiFetch(`/ops/cases/${selected.id}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${path}: done.` : `${path}: ${data.error ?? res.status}`)
    await loadQueue()
    if (res.ok && path !== 'delete') await open(selected)
    if (path === 'delete' && res.ok) setSelected(null)
  }

  const exportArchive = async () => {
    if (!selected) return
    const res = await apiFetch(`/ops/cases/${selected.id}/disclosure-archive`)
    const data = await res.json().catch(() => ({}))
    setNotice(res.ok ? `Archive: ${data.acknowledgments.length} acknowledgment(s) — see console.` : data.error ?? 'export failed')
    if (res.ok) console.log('E-6 disclosure archive', data)
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] p-6 font-sans text-[#E6EDF3]">
      <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Operations Console</h1>
      {notice && <p className="mt-2 text-sm text-[#D29922]">{notice}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">Case</th>
              <th className="py-2 pr-3">Stage</th>
              <th className="py-2 pr-3">Lane</th>
              <th className="py-2 pr-3">Days</th>
              <th className="py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((c) => (
              <tr
                key={c.id}
                onClick={() => open(c)}
                className={`cursor-pointer border-b border-[#161B22] hover:bg-[#161B22] ${selected?.id === c.id ? 'bg-[#161B22]' : ''}`}
              >
                <td className="py-2 pr-3">{c.title}</td>
                <td className="py-2 pr-3 font-mono text-xs">{c.status}</td>
                <td className="py-2 pr-3">{c.lane ?? '—'}</td>
                <td className="py-2 pr-3 font-mono">{c.daysInStage}</td>
                <td className="py-2 space-x-1">
                  {c.stalled && <span className="rounded bg-[#D29922]/20 px-1.5 text-xs text-[#D29922]">STALL</span>}
                  {c.ocrHalt && <span className="rounded bg-[#F85149]/20 px-1.5 text-xs text-[#F85149]">OCR</span>}
                  {c.delayOurs && <span className="rounded bg-[#3B82F6]/20 px-1.5 text-xs text-[#3B82F6]">DELAY-OURS</span>}
                  {c.subsequentWrit && <span className="rounded bg-[#D4AF37]/20 px-1.5 text-xs text-[#D4AF37]">§4</span>}
                </td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-[#8B949E]">No active cases.</td></tr>
            )}
          </tbody>
        </table>

        <div>
          {selected ? (
            <div className="rounded border border-[#30363D] bg-[#161B22] p-4">
              <h2 className="font-semibold">{selected.title}</h2>

              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={delayDate}
                    onChange={(e) => setDelayDate(e.target.value)}
                    className="rounded border border-[#30363D] bg-[#0B0E14] p-1.5 text-xs"
                  />
                  <button
                    onClick={() => act('delay-ours', { extendedToDate: delayDate })}
                    disabled={!delayDate}
                    className="rounded border border-[#3B82F6] px-2 py-1 text-xs text-[#3B82F6] disabled:opacity-40"
                  >
                    Mark delay ours
                  </button>
                  {selected.delayOurs && (
                    <button onClick={() => act('delay-cleared')} className="rounded border border-[#30363D] px-2 py-1 text-xs">
                      Clear delay
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={exportArchive} className="rounded border border-[#30363D] px-2 py-1 text-xs">
                    E-6 disclosure archive
                  </button>
                  <button
                    onClick={() => act('refund', { reason: 'customer_request' }, 'Issue a full refund for this case?')}
                    className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]"
                  >
                    Refund
                  </button>
                  <button
                    onClick={() =>
                      act('delete', undefined,
                        'SCOPED DELETION: case content is hard-deleted; the payment ledger, disclosure archive, and event/audit skeleton are retained by design. Continue?')
                    }
                    className="rounded border border-[#F85149] px-2 py-1 text-xs text-[#F85149]"
                  >
                    Delete (OPS-4)
                  </button>
                </div>
              </div>

              <h3 className="mt-5 text-xs uppercase tracking-wider text-[#8B949E]">Event timeline</h3>
              <ul className="mt-2 max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
                {timeline.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="shrink-0 text-[#8B949E]">{new Date(e.createdAt).toISOString().slice(5, 16)}</span>
                    <span className="text-[#D4AF37]">{e.type}</span>
                    <span className="truncate text-[#8B949E]">{e.actor}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-[#8B949E]">Select a case for its timeline and actions.</p>
          )}
        </div>
      </div>
    </div>
  )
}
