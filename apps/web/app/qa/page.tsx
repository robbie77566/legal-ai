'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

/**
 * QA console (US-8) — Industrial Authority staff surface (never Daybreak:
 * its user is a professional in deep work). Queue → findings → verify/edit →
 * approve or reject. Every approve snapshots exactly what the customer will
 * see (ENG-8); the API enforces FR-7 and the role gate.
 */

interface QueueRow {
  id: string
  title: string
  lane: string | null
  subsequentWrit: boolean
  findingCount: number
  updatedAt: string
}
interface Finding {
  id: string
  category: string
  severity: string
  confidence: number
  adjudication: string
  provenance: string
  partAText: string
  partBText: string
  citations: { volume: string | null; page: number | null; excerpt: string; excerptHash: string }[]
}

export default function QaConsole() {
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [findings, setFindings] = useState<Finding[]>([])
  const [caseMeta, setCaseMeta] = useState<{ title: string; lane: string | null; subsequentWrit: boolean } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState('')

  const loadQueue = useCallback(async () => {
    const res = await apiFetch('/qa/queue')
    if (res.ok) setQueue(await res.json())
  }, [])

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  const open = async (id: string) => {
    setSelected(id)
    setNotice('')
    const res = await apiFetch(`/qa/cases/${id}`)
    if (res.ok) {
      const body = await res.json()
      setFindings(body.findings)
      setCaseMeta(body.case)
    }
  }

  const saveEdit = async (findingId: string) => {
    const res = await apiFetch(`/qa/findings/${findingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partAText: draft }),
    })
    if (res.ok && selected) {
      setEditing(null)
      await open(selected)
    }
  }

  const decide = async (action: 'approve' | 'reject') => {
    if (!selected) return
    const res = await apiFetch(`/qa/cases/${selected}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'reject' ? JSON.stringify({ reason: 'quality' }) : undefined,
    })
    if (res.ok) {
      setNotice(action === 'approve' ? 'Approved — report snapshot written, case is READY.' : 'Rejected to engineering triage.')
      setSelected(null)
      await loadQueue()
    } else {
      const body = await res.json().catch(() => ({}))
      setNotice(body.error ?? `Could not ${action}.`)
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] p-6 font-sans text-[#E6EDF3]">
      <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Quality Review Console</h1>
      {notice && <p className="mt-2 text-sm text-[#3FB950]">{notice}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-[#8B949E]">Queue</h2>
          <ul className="mt-2 space-y-1">
            {queue.length === 0 && <li className="text-sm text-[#8B949E]">Nothing awaiting review.</li>}
            {queue.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => open(c.id)}
                  className={`w-full rounded border border-[#30363D] bg-[#161B22] p-3 text-left text-sm hover:border-[#D4AF37] ${selected === c.id ? 'border-[#D4AF37]' : ''}`}
                >
                  <span className="font-semibold">{c.title}</span>
                  <span className="mt-1 block text-xs text-[#8B949E]">
                    {c.lane ?? '—'} · {c.findingCount} finding{c.findingCount === 1 ? '' : 's'}
                    {c.subsequentWrit ? ' · §4 MODE' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          {selected && caseMeta ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {caseMeta.title}
                  {caseMeta.subsequentWrit && (
                    <span className="ml-2 rounded bg-[#D29922]/20 px-2 py-0.5 text-xs text-[#D29922]">
                      subsequent-writ mode
                    </span>
                  )}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => decide('reject')}
                    className="rounded border border-[#F85149] px-4 py-2 text-sm text-[#F85149]"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => decide('approve')}
                    className="rounded bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#0B0E14]"
                  >
                    Approve — release to family
                  </button>
                </div>
              </div>

              <ul className="mt-4 space-y-3">
                {findings.map((f) => (
                  <li key={f.id} className="rounded border border-[#30363D] bg-[#161B22] p-4">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded bg-[#D4AF37]/15 px-2 py-0.5 text-[#D4AF37]">{f.category}</span>
                      <span className="text-[#8B949E]">{f.severity}</span>
                      <span className="text-[#8B949E]">conf {Math.round(f.confidence * 100)}%</span>
                      {f.adjudication === 'disagree' && (
                        <span className="rounded bg-[#F85149]/20 px-2 py-0.5 text-[#F85149]">ADJUDICATION DISAGREES</span>
                      )}
                      {f.provenance === 'ai_human_edited' && (
                        <span className="text-[#3FB950]">edited</span>
                      )}
                    </div>

                    {f.citations[0] && (
                      <blockquote className="mt-3 border-l-2 border-[#D4AF37] bg-[#FDF6E3] p-3 font-serif text-sm text-[#586E75]">
                        “{f.citations[0].excerpt}”
                        <span className="mt-1 block font-mono text-xs">
                          {f.citations[0].volume ?? 'Record'}
                          {f.citations[0].page ? ` p.${f.citations[0].page}` : ''} ·{' '}
                          {f.citations[0].excerptHash.slice(0, 12)}
                        </span>
                      </blockquote>
                    )}

                    <p className="mt-3 text-xs uppercase tracking-wider text-[#8B949E]">Part A (family)</p>
                    {editing === f.id ? (
                      <div className="mt-1">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={3}
                          className="w-full rounded border border-[#30363D] bg-[#0B0E14] p-2 text-sm"
                        />
                        <div className="mt-1 flex gap-2">
                          <button onClick={() => saveEdit(f.id)} className="rounded bg-[#D4AF37] px-3 py-1 text-xs font-semibold text-[#0B0E14]">
                            Save
                          </button>
                          <button onClick={() => setEditing(null)} className="text-xs text-[#8B949E]">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm">
                        {f.partAText}{' '}
                        <button
                          onClick={() => {
                            setEditing(f.id)
                            setDraft(f.partAText)
                          }}
                          className="text-xs text-[#D4AF37] underline"
                        >
                          edit
                        </button>
                      </p>
                    )}

                    <p className="mt-3 text-xs uppercase tracking-wider text-[#8B949E]">Part B (attorney)</p>
                    <p className="mt-1 text-sm text-[#8B949E]">{f.partBText}</p>
                  </li>
                ))}
                {findings.length === 0 && (
                  <li className="text-sm text-[#8B949E]">
                    No findings — approving releases an honest “nothing found” report.
                  </li>
                )}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[#8B949E]">Select a case from the queue.</p>
          )}
        </div>
      </div>
    </div>
  )
}
