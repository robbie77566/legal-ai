'use client'

import { useState } from 'react'
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await apiFetch(`/cases/${caseId}/interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          county,
          convictionYear: Number(year),
          ...(trialDays ? { trialDays: Number(trialDays) } : {}),
          hadAppeal: hadAppeal === 'yes',
        }),
      })
      if (!res.ok) throw new Error('Could not save the answers — please try again.')
      router.push(`/case/${caseId}/documents`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">A few questions about the case</h1>
      <p className="mt-2 text-sm text-db-muted">
        These build your personal document checklist — with how-to-get-it help for every item.
      </p>
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
            min={0}
            max={365}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 font-db-mono"
          />
        </label>
        <fieldset>
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
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
        >
          {busy ? 'Building your checklist…' : 'Build my document checklist'}
        </button>
      </form>
    </main>
  )
}
