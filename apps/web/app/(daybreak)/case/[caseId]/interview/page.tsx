'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/** S2 case interview (UI spec §5.4): short, plain, builds the checklist. */
export default function CaseInterview() {
  const { caseId } = useParams<{ caseId: string }>()
  const router = useRouter()
  const [county, setCounty] = useState('')
  const [year, setYear] = useState('')
  const [trialDays, setTrialDays] = useState('')
  const [hadAppeal, setHadAppeal] = useState<'yes' | 'no' | ''>('')
  const [judgmentDate, setJudgmentDate] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [known, setKnown] = useState<Record<string, unknown> | null>(null)
  const [locked, setLocked] = useState(false)
  const [factLines, setFactLines] = useState<Array<{ key: string; label: string; value: string | null; derived?: boolean }>>([])

  // Never ask twice: prefill from what the case already knows (the free
  // check at purchase, or an earlier visit here).
  useEffect(() => {
    void apiFetch(`/cases/${caseId}/checklist`).then(async (r) => {
      if (!r.ok) return
      const d = await r.json()
      const f = (d.facts ?? {}) as Record<string, unknown>
      setKnown(f)
      setLocked(d.status !== 'AWAITING_DOCS')
      setFactLines(d.factLines ?? [])
      if (typeof f.county === 'string') setCounty(f.county)
      if (typeof f.convictionYear === 'number') setYear(String(f.convictionYear))
      if (typeof f.trialDays === 'number') setTrialDays(String(f.trialDays))
      if (typeof f.judgmentDate === 'string') setJudgmentDate(f.judgmentDate)
      if (f.appeal) setHadAppeal(f.appeal === 'none' ? 'no' : 'yes')
    })
  }, [caseId])
  const appealKnown = !!known?.appeal
  const returning = !!(known && (known.county || known.convictionYear))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (locked) {
        // Lock semantics: after records-complete only the contact-style
        // facts change; the checklist and analysis are not touched.
        const res = await apiFetch(`/cases/${caseId}/facts`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            county,
            convictionYear: Number(year),
            trialDays: trialDays ? Number(trialDays) : null,
            judgmentDate: judgmentDate || null,
          }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `Could not save (error ${res.status}) — please try again.`)
        }
        router.push(`/case/${caseId}`)
        return
      }
      const res = await apiFetch(`/cases/${caseId}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county,
          convictionYear: Number(year),
          ...(trialDays ? { trialDays: Number(trialDays) } : {}),
          ...(appealKnown ? {} : { hadAppeal: hadAppeal === 'yes' }),
          ...(judgmentDate ? { judgmentDate } : {}),
        }),
      })
      if (res.status === 409) {
        // The case has already moved past intake (records marked complete,
        // pipeline running) — the interview no longer applies. Go to the
        // case instead of dead-ending on an error (2026-09-05).
        router.push(`/case/${caseId}/documents`)
        return
      }
      if (!res.ok) {
        // Show the server's reason (a validation rule) instead of a dead-end
        // generic (2026-09-05).
        const body = (await res.json().catch(() => ({}))) as { error?: string; field?: string }
        throw new Error(
          body.error
            ? `${body.error}${body.field ? ` (${body.field})` : ''}`
            : `Could not save the answers (error ${res.status}) — please try again.`
        )
      }
      router.push(`/case/${caseId}/documents`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">{locked ? 'Case details' : returning ? 'Confirm the details' : 'A few questions about the case'}</h1>
      <p className="mt-2 text-sm text-db-muted">
        {locked
          ? 'Your review was built on these answers, so the ones that shape it are locked — a re-run is where they can change. County, year, and dates can still be corrected here.'
          : 'These build your personal document checklist — with how-to-get-it help for every item.'}
      </p>
      {locked && <p className="mt-1 text-xs text-db-muted" data-testid="locked-note">Locked: how it was decided, direct appeal, prior writ.</p>}
      {factLines.some((l) => l.value && !['conviction', 'trialDays', 'judgmentDate'].includes(l.key)) && (
        <section data-testid="known-facts" className="mt-5 rounded-xl border border-db-line bg-db-surface p-4">
          <h2 className="text-sm font-semibold">From your free check</h2>
          <p className="mt-1 text-xs text-db-muted">Already saved — you won&rsquo;t be asked these again.</p>
          <dl className="mt-3 grid grid-cols-[minmax(0,40%)_1fr] gap-x-4 gap-y-1.5 text-sm">
            {factLines
              .filter((l) => l.value && !['conviction', 'trialDays', 'judgmentDate'].includes(l.key))
              .map((l) => (
                <div key={l.key} className="contents">
                  <dt className="text-db-muted">{l.label}</dt>
                  <dd>{l.value}{l.derived && <span className="ml-1 text-xs text-db-muted">(we chose this from your answers)</span>}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm" style={{ color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold">Which county was the conviction in?</span>
          <input
            required
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            maxLength={64}
            className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">What year was the conviction?</span>
          <input
            required
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={1950}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 font-db-mono"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">
            About how many days did the trial last? (skip if unsure)
          </span>
          <input
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={365}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 font-db-mono"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Judgment date (skip if you don&rsquo;t have it)</span>
          <input
            type="date"
            value={judgmentDate}
            onChange={(e) => setJudgmentDate(e.target.value)}
            aria-label="Judgment date"
            className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 font-db-mono"
          />
          <span className="mt-1 block text-xs text-db-muted">
            It&rsquo;s on the judgment paper. Adding it unlocks the time-limits section of your report; you can add it later.
          </span>
        </label>
        {!appealKnown && (
        <fieldset data-testid="appeal-question">
          <legend className="text-sm font-semibold">Was there a direct appeal?</legend>
          <div className="mt-2 space-y-2">
            {(['yes', 'no'] as const).map((v) => (
              <label key={v} className="flex items-center gap-3 rounded-lg border border-db-line bg-db-surface p-3">
                <input
                  type="radio"
                  name="hadAppeal"
                  required
                  checked={hadAppeal === v}
                  onChange={() => setHadAppeal(v)}
                />
                <span>{v === 'yes' ? 'Yes' : 'No'}</span>
              </label>
            ))}
          </div>
        </fieldset>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
        >
          {busy ? 'Saving…' : locked ? 'Save changes' : returning ? 'Save and continue to documents' : 'Build my document checklist'}
        </button>
      </form>
    </main>
  )
}
