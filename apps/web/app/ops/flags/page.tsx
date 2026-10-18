'use client'

/**
 * Feature flags (staff_console.md §10): the six dark surfaces of the rollout
 * plan, each with its global switch and its per-organisation overrides.
 * ADMIN flips; SUPPORT reads. A flip is live on every instance within
 * 15 seconds — no deploy. Overrides are keyed by tenant id until the
 * Organisation model lands. Industrial Authority palette.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { useStaffRole } from '@/lib/staff-role'

interface Override {
  tenantId: string
  enabled: boolean
  note: string | null
  updatedBy: string
  updatedAt: string
}

interface Flag {
  key: string
  enabled: boolean
  description: string
  updatedBy: string | null
  updatedAt: string
  overrides: Override[]
}

export default function FlagsPage() {
  const role = useStaffRole()
  const canWrite = role === 'ADMIN'
  const [flags, setFlags] = useState<Flag[]>([])
  const [notice, setNotice] = useState('')
  const [drafts, setDrafts] = useState<Record<string, { tenantId: string; enabled: boolean; note: string }>>({})

  const load = () => void apiFetch('/ops/flags').then(async (r) => r.ok && setFlags(await r.json()))
  useEffect(load, [])

  // Every write says what happened: a silent failure on a flag is a surface
  // that is lit (or dark) in production without anyone knowing.
  const write = async (url: string, init: RequestInit, done: string) => {
    setNotice('')
    try {
      const res = await apiFetch(url, init)
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        setNotice(err.error ?? `Could not save (error ${res.status})`)
        return false
      }
      setNotice(done)
    } catch {
      setNotice('The request did not reach the server — check the API and try again')
      return false
    }
    load()
    return true
  }
  const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const toggle = (f: Flag) => write(`/ops/flags/${f.key}`, jsonInit('PUT', { enabled: !f.enabled }), `${f.key} is now ${f.enabled ? 'OFF' : 'ON'} for everyone without an override`)
  const removeOverride = (f: Flag, o: Override) => write(`/ops/flags/${f.key}/overrides/${o.tenantId}`, { method: 'DELETE' }, `${f.key}: override for ${o.tenantId} removed`)
  const addOverride = async (f: Flag, e: React.FormEvent) => {
    e.preventDefault()
    const d = drafts[f.key] ?? { tenantId: '', enabled: true, note: '' }
    const tenantId = d.tenantId.trim()
    if (!tenantId) return
    const ok = await write(
      `/ops/flags/${f.key}/overrides/${encodeURIComponent(tenantId)}`,
      jsonInit('PUT', { enabled: d.enabled, ...(d.note.trim() ? { note: d.note.trim() } : {}) }),
      `${f.key}: ${d.enabled ? 'ON' : 'OFF'} for ${tenantId}`
    )
    if (ok) setDrafts((prev) => ({ ...prev, [f.key]: { tenantId: '', enabled: true, note: '' } }))
  }
  const draft = (key: string) => drafts[key] ?? { tenantId: '', enabled: true, note: '' }
  const setDraft = (key: string, patch: Partial<{ tenantId: string; enabled: boolean; note: string }>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...draft(key), ...patch } }))

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Feature flags</h1>
        <Link href="/ops" className="text-sm text-[#8B949E] underline">
          ← Operations
        </Link>
      </div>
      <p className="mt-2 max-w-3xl text-sm text-[#8B949E]">
        Every professional surface ships dark behind one of these. An override for an organisation wins over the global
        switch. A flip is live within 15 seconds on every instance — no deploy.
        {!canWrite && ' You can see the state here; flipping a flag needs an Ops administrator.'}
      </p>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="flags-notice">{notice}</p>}

      <table className="mt-6 w-full border-collapse text-sm" data-testid="flags-table">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Flag</th>
            <th>Global</th>
            <th>Overrides</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.key} className="border-b border-[#21262D] align-top">
              <td className="py-3 pr-4">
                <div className="font-mono text-[#D4AF37]">{f.key}</div>
                <div className="mt-1 max-w-sm text-xs text-[#8B949E]">{f.description}</div>
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">
                <span className={f.enabled ? 'text-[#3FB950]' : 'text-[#8B949E]'} data-testid={`flag-global-${f.key}`}>
                  {f.enabled ? 'ON' : 'off'}
                </span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => void toggle(f)}
                    className="ml-3 text-xs text-[#3B82F6] underline"
                    data-testid={`flag-toggle-${f.key}`}
                  >
                    turn {f.enabled ? 'off' : 'on'}
                  </button>
                )}
              </td>
              <td className="py-3">
                {f.overrides.length === 0 && <span className="text-xs text-[#8B949E]">none</span>}
                <ul className="space-y-1" data-testid={`flag-overrides-${f.key}`}>
                  {f.overrides.map((o) => (
                    <li key={o.tenantId} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono">{o.tenantId}</span>
                      <span className={o.enabled ? 'text-[#3FB950]' : 'text-[#F85149]'}>{o.enabled ? 'ON' : 'OFF'}</span>
                      {o.note && <span className="text-[#8B949E]">— {o.note}</span>}
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => void removeOverride(f, o)}
                          className="text-[#8B949E] underline"
                          data-testid={`flag-override-remove-${f.key}-${o.tenantId}`}
                        >
                          remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {canWrite && (
                  <form onSubmit={(e) => void addOverride(f, e)} className="mt-2 flex flex-wrap items-center gap-2 text-xs" data-testid={`flag-override-form-${f.key}`}>
                    <input
                      value={draft(f.key).tenantId}
                      onChange={(e) => setDraft(f.key, { tenantId: e.target.value })}
                      placeholder="tenant id"
                      aria-label={`${f.key} override tenant id`}
                      className="w-48 rounded border border-[#30363D] bg-[#161B22] p-1 font-mono"
                    />
                    <select
                      value={draft(f.key).enabled ? 'on' : 'off'}
                      onChange={(e) => setDraft(f.key, { enabled: e.target.value === 'on' })}
                      aria-label={`${f.key} override value`}
                      className="rounded border border-[#30363D] bg-[#161B22] p-1"
                    >
                      <option value="on">ON</option>
                      <option value="off">OFF</option>
                    </select>
                    <input
                      value={draft(f.key).note}
                      onChange={(e) => setDraft(f.key, { note: e.target.value })}
                      placeholder="note (optional)"
                      aria-label={`${f.key} override note`}
                      className="w-56 rounded border border-[#30363D] bg-[#161B22] p-1"
                    />
                    <button className="rounded bg-[#D4AF37] px-2 py-1 font-semibold text-[#0B0E14]">Add override</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
