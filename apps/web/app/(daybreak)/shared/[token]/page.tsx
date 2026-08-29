'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/** The attorney's view of a shared Part B packet (ENG-8): token-gated, plain. */

interface SharedFinding {
  category: string
  severity: string
  partBText: string
  citations: { volume: string | null; page: number | null; line: number | null; excerpt: string }[]
}

export default function SharedReport() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<{ notice: string; findings: SharedFinding[] } | null>(null)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    void apiFetch(`/shared/${token}`)
      .then(async (r) => (r.ok ? setData(await r.json()) : setGone(true)))
      .catch(() => setGone(true))
  }, [token])

  if (gone) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12">
        <p className="rounded-xl border border-db-line bg-db-surface p-6">
          This link is no longer available — it may have expired or been turned off by the family.
        </p>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-2xl px-5 py-12 text-db-muted">Loading…</main>

  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">Attorney working packet — Part B</h1>
      <p className="mt-2 text-sm text-db-muted">{data.notice}</p>

      <ol className="mt-6 space-y-4">
        {data.findings.map((f, i) => (
          <li key={i} className="rounded-xl border border-db-line bg-db-surface p-4">
            <p className="font-db-mono text-xs uppercase text-db-muted">
              {f.category} · {f.severity}
            </p>
            <p className="mt-2">{f.partBText}</p>
            {f.citations.map((c, j) => (
              <p key={j} className="mt-2 border-l-2 border-db-accent pl-3 font-db-mono text-sm text-db-muted">
                {c.volume ?? 'Record'}
                {c.page ? ` p.${c.page}` : ''}
                {c.line ? `:${c.line}` : ''} — “{c.excerpt}”
              </p>
            ))}
          </li>
        ))}
        {data.findings.length === 0 && (
          <li className="rounded-xl border border-db-line bg-db-surface p-4 text-db-muted">
            The review recorded no findings; the family&rsquo;s report explains the scope of what was checked.
          </li>
        )}
      </ol>
    </main>
  )
}
