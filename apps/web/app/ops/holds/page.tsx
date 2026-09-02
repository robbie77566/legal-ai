'use client'

/** Holds (ops_console_redesign.md J1/F5): the 24-hour promise queue — most
 *  urgent first, one-click re-run, and the reasons the gate held it. */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface Hold { caseId: string; title: string; reasons: string[]; heldAt: string; slaRemainingHours: number }

export default function OpsHolds() {
  const [holds, setHolds] = useState<Hold[] | null>(null)
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    const r = await apiFetch('/qa/holds')
    setHolds(r.ok ? await r.json() : [])
  }, [])
  useEffect(() => { void load() }, [load])

  const rerun = async (id: string) => {
    const r = await apiFetch(`/qa/cases/${id}/rerun`, { method: 'POST' })
    setNotice(r.ok ? 'Re-run queued — the case leaves this list when the new run passes the gates.' : 'Re-run failed.')
    await load()
  }

  return (
    <div>
      <h1 className="font-serif text-lg font-bold text-[#D4AF37]">Quality holds</h1>
      <p className="mt-1 text-sm text-[#8B949E]">Reports the automated gates would not deliver. The customer was told to expect a human decision within 24 hours.</p>
      {notice && <p className="mt-3 text-sm text-[#D29922]">{notice}</p>}
      {holds === null ? (
        <p className="mt-4 text-sm text-[#8B949E]">Loading…</p>
      ) : holds.length === 0 ? (
        <p className="mt-4 rounded border border-[#30363D] bg-[#0D1117] p-4 text-sm text-[#8B949E]" data-testid="holds-empty">No holds — nothing is waiting on you.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">Case</th><th className="py-2 pr-3">Held because</th><th className="py-2 pr-3">Promise</th><th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {holds.map((h) => (
              <tr key={h.caseId} className="border-b border-[#161B22]">
                <td className="py-2 pr-3">{h.title}</td>
                <td className="py-2 pr-3 text-xs text-[#8B949E]">{h.reasons.join(', ') || 'quality gate'}</td>
                <td className={`py-2 pr-3 font-mono text-xs ${h.slaRemainingHours < 4 ? 'text-[#F85149]' : 'text-[#D29922]'}`}>
                  {h.slaRemainingHours <= 0 ? 'MISSED' : `${h.slaRemainingHours}h left`}
                </td>
                <td className="space-x-2 py-2 text-right">
                  <button onClick={() => void rerun(h.caseId)} className="rounded border border-[#D4AF37] px-2 py-1 text-xs text-[#D4AF37]">Re-run analysis</button>
                  <Link href="/qa" className="rounded border border-[#30363D] px-2 py-1 text-xs text-[#8B949E]">Review in QA</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
