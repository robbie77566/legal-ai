'use client'

/** Promo management (promo_codes.md §3 admin) — Industrial Authority. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'

interface Promo {
  id: string
  code: string
  amountOffCents: number
  maxRedemptions: number | null
  redeemedCount: number
  expiresAt: string | null
  active: boolean
}

export default function PromoAdmin() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [notice, setNotice] = useState('')
  const [code, setCode] = useState('')
  const [off, setOff] = useState('299')
  const [max, setMax] = useState('25')
  const [expires, setExpires] = useState('')

  const load = () => void apiFetch('/ops/promos').then(async (r) => r.ok && setPromos(await r.json()))
  useEffect(load, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice('')
    const res = await apiFetch('/ops/promos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        amountOffCents: Math.round(Number(off) * 100),
        ...(max ? { maxRedemptions: Number(max) } : {}),
        ...(expires ? { expiresAt: new Date(expires).toISOString() } : {}),
      }),
    })
    const body = await res.json()
    setNotice(res.ok ? `Created ${body.code}` : (body.error ?? 'Could not create the code'))
    if (res.ok) {
      setCode('')
      load()
    }
  }

  const toggle = async (p: Promo) => {
    await apiFetch(`/ops/promos/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Promo Codes</h1>
        <Link href="/ops" className="text-sm text-[#8B949E] underline">
          ← Operations
        </Link>
      </div>
      {notice && <p className="mt-2 text-sm text-[#D29922]">{notice}</p>}

      <form onSubmit={create} className="mt-6 flex flex-wrap items-end gap-3 rounded border border-[#30363D] p-4">
        <label className="text-xs text-[#8B949E]">
          Code (what the customer types)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            className="mt-1 block w-40 rounded border border-[#30363D] bg-[#161B22] p-2 font-mono uppercase"
          />
        </label>
        <label className="text-xs text-[#8B949E]">
          $ off the $299
          <input
            value={off}
            onChange={(e) => setOff(e.target.value)}
            type="number"
            min="1"
            max="299"
            required
            className="mt-1 block w-24 rounded border border-[#30363D] bg-[#161B22] p-2"
          />
        </label>
        <label className="text-xs text-[#8B949E]">
          Max uses (a free case still costs ~$5–10 to produce)
          <input
            value={max}
            onChange={(e) => setMax(e.target.value)}
            type="number"
            min="1"
            className="mt-1 block w-24 rounded border border-[#30363D] bg-[#161B22] p-2"
          />
        </label>
        <label className="text-xs text-[#8B949E]">
          Expires (optional)
          <input
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            type="date"
            className="mt-1 block rounded border border-[#30363D] bg-[#161B22] p-2"
          />
        </label>
        <button className="rounded bg-[#D4AF37] px-4 py-2 font-semibold text-[#0B0E14]">Create</button>
      </form>

      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
            <th className="py-2">Code</th>
            <th>Off</th>
            <th>Redeemed</th>
            <th>Expires</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {promos.map((p) => (
            <tr key={p.id} className="border-b border-[#21262D]">
              <td className="py-2 font-mono text-[#D4AF37]">{p.code}</td>
              <td>
                ${(p.amountOffCents / 100).toFixed(0)}
                {p.amountOffCents >= 29900 ? ' (FREE)' : ''}
              </td>
              <td>
                {p.redeemedCount}
                {p.maxRedemptions != null ? ` / ${p.maxRedemptions}` : ''}
              </td>
              <td>{p.expiresAt ? new Date(p.expiresAt).toLocaleDateString() : '—'}</td>
              <td className={p.active ? 'text-[#3FB950]' : 'text-[#8B949E]'}>{p.active ? 'active' : 'off'}</td>
              <td>
                <button onClick={() => void toggle(p)} className="text-xs text-[#8B949E] underline">
                  {p.active ? 'deactivate' : 'reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
