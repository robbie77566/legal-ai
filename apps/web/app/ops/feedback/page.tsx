'use client'

/** Feedback (ops_console_redesign.md J5/F5): the customer survey signal —
 *  clarity, would-recommend, shared-with-lawyer, and the open text that
 *  lives ONLY here (never in analytics). Read-only. */
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Row {
  id: string; caseId: string; title: string; clarity: number | null; recommend: string | null
  sharedWithLawyer: string | null; decidedText: string | null; objectionText: string | null; updatedAt: string
}

export default function OpsFeedback() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { void apiFetch('/ops/feedback').then(async (r) => setRows(r.ok ? await r.json() : [])) }, [])
  const avg = rows && rows.filter((r) => r.clarity).length
    ? (rows.reduce((s, r) => s + (r.clarity ?? 0), 0) / rows.filter((r) => r.clarity).length).toFixed(1)
    : null
  return (
    <div>
      <h1 className="font-serif text-lg font-bold text-[#D4AF37]">Customer feedback</h1>
      <p className="mt-1 text-sm text-[#8B949E]">
        {rows ? `${rows.length} response(s)` : 'Loading…'}{avg && ` · average clarity ${avg}/5`}
        {rows && ` · would recommend: ${rows.filter((r) => r.recommend === 'yes').length} yes / ${rows.filter((r) => r.recommend === 'not_sure').length} unsure / ${rows.filter((r) => r.recommend === 'no').length} no`}
      </p>
      {rows && rows.length === 0 && <p className="mt-4 rounded border border-[#30363D] bg-[#0D1117] p-4 text-sm text-[#8B949E]">No feedback yet — the survey appears on the report page and in the +7-day email.</p>}
      {rows && rows.length > 0 && (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">Case</th><th className="py-2 pr-3">Clarity</th><th className="py-2 pr-3">Recommend</th><th className="py-2 pr-3">Shared</th><th className="py-2">In their words</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[#161B22] align-top">
                <td className="py-2 pr-3">{r.title}<div className="text-[11px] text-[#8B949E]">{new Date(r.updatedAt).toLocaleDateString()}</div></td>
                <td className="py-2 pr-3 font-mono">{r.clarity ?? '—'}</td>
                <td className="py-2 pr-3">{r.recommend ?? '—'}</td>
                <td className="py-2 pr-3">{r.sharedWithLawyer ?? '—'}</td>
                <td className="py-2 text-xs text-[#8B949E]">
                  {r.decidedText && <p>“{r.decidedText}”</p>}
                  {r.objectionText && <p className="mt-1">Almost stopped them: “{r.objectionText}”</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
