'use client'

/** Retention (ops_console_redesign.md J6/F5): cases past the 12-month
 *  window (NFR-3). Deletion stays a deliberate, per-case, typed-title act —
 *  never a bulk sweep. */
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Candidate { id: string; title: string; status: string; updatedAt: string }

export default function OpsRetention() {
  const [data, setData] = useState<{ cutoff: string; count: number; cases: Candidate[] } | null>(null)
  const [typed, setTyped] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    const r = await apiFetch('/ops/retention-candidates')
    if (r.ok) setData(await r.json())
  }, [])
  useEffect(() => { void load() }, [load])

  const del = async (c: Candidate) => {
    const r = await apiFetch(`/ops/cases/${c.id}/delete`, { method: 'POST' })
    const body = await r.json().catch(() => ({}))
    setNotice(r.ok ? `Deleted "${c.title}" — ledger, disclosure archive, and event skeleton retained by design.` : body.error ?? 'Deletion failed')
    await load()
  }

  return (
    <div>
      <h1 className="font-serif text-lg font-bold text-[#D4AF37]">Retention</h1>
      <p className="mt-1 text-sm text-[#8B949E]">
        Delivered or refunded cases untouched for 12 months{data && ` (before ${data.cutoff.slice(0, 10)})`}. Each deletion is a deliberate decision — type the case title to enable it.
      </p>
      {notice && <p className="mt-3 text-sm text-[#D29922]">{notice}</p>}
      {data && data.count === 0 && <p className="mt-4 rounded border border-[#30363D] bg-[#0D1117] p-4 text-sm text-[#8B949E]">Nothing past the retention window.</p>}
      {data && data.count > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">Case</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Last touched</th><th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data.cases.map((c) => (
              <tr key={c.id} className="border-b border-[#161B22]">
                <td className="py-2 pr-3">{c.title}</td>
                <td className="py-2 pr-3 font-mono text-xs">{c.status}</td>
                <td className="py-2 pr-3 text-xs text-[#8B949E]">{new Date(c.updatedAt).toLocaleDateString()}</td>
                <td className="space-x-2 py-2 text-right">
                  <input value={typed[c.id] ?? ''} onChange={(e) => setTyped({ ...typed, [c.id]: e.target.value })} placeholder="type title to enable" className="w-48 rounded border border-[#30363D] bg-[#0B0E14] p-1 font-mono text-xs" />
                  <button onClick={() => void del(c)} disabled={(typed[c.id] ?? '').trim() !== c.title} className="rounded border border-[#F85149] px-2 py-1 text-xs text-[#F85149] disabled:opacity-40">Delete (OPS-4)</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
