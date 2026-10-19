'use client'

/**
 * The PD pilot form (/for-counsel §7, /for-offices, /for-investigators):
 * office, county, name, email, a note. Posts to the public
 * POST /counsel/pilot-interest, which emails every admin; the founder answers
 * in person. No account is created and nothing is stored but an audit row.
 */
import { useState } from 'react'
import { pilotInterest } from '@/lib/api'

const field = 'mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-[15px]'

export default function PilotInterestForm({ lead, idPrefix = 'pilot' }: { lead?: string; idPrefix?: string }) {
  const [form, setForm] = useState({ office: '', county: '', name: '', email: '', note: '' })
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setState('busy')
    try {
      const res = await pilotInterest({ ...form, note: form.note || undefined })
      if (res.status === 429) throw new Error('Too many requests from this connection — wait a few minutes and try again.')
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'The form did not reach us — please try again.')
      }
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The form did not reach us — please try again.')
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <p role="status" data-testid={`${idPrefix}-sent`} className="rounded-xl border border-db-line bg-db-surface p-4">
        Received. The founder will write to <span className="font-db-mono">{form.email}</span> within two working days.
      </p>
    )
  }

  return (
    <form onSubmit={submit} data-testid={`${idPrefix}-form`} className="rounded-xl border border-db-line bg-db-surface p-5">
      {lead && <p className="mb-4 text-sm text-db-muted">{lead}</p>}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Office</span>
          <input id={`${idPrefix}-office`} required maxLength={160} value={form.office} onChange={set('office')} className={field} autoComplete="organization" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">County</span>
          <input id={`${idPrefix}-county`} required maxLength={64} value={form.county} onChange={set('county')} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Your name</span>
          <input id={`${idPrefix}-name`} required maxLength={100} value={form.name} onChange={set('name')} className={field} autoComplete="name" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Email</span>
          <input id={`${idPrefix}-email`} type="email" required maxLength={254} value={form.email} onChange={set('email')} className={field} autoComplete="email" />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">Anything we should know (optional)</span>
        <textarea id={`${idPrefix}-note`} maxLength={2000} rows={3} value={form.note} onChange={set('note')} className={field} />
      </label>
      <button type="submit" disabled={state === 'busy'} className="mt-5 rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40">
        {state === 'busy' ? 'Sending…' : 'Ask about the pilot'}
      </button>
    </form>
  )
}
