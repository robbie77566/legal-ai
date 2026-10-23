/**
 * Feature flags on the web side (persona_rollout_plan.md §7 "Flags, not
 * branches"). The API owns the values (`GET /flags`, effective for the
 * caller's tenant); this file is the two ways a page reads them:
 *
 *  - `getFlags()`  — server components and route handlers, forwarding the
 *                    session cookie the way the browser would.
 *  - `useFlags()`  — client components, one fetch on mount.
 *
 * Both default every key to false, so a page that cannot reach the API
 * stays dark rather than lighting a surface that has not launched. The real
 * gate is the API's `requireFlag` preHandler; this is UX gating only.
 */
import { useEffect, useState } from 'react'
import { API_URL, apiFetch } from './api'

export const FLAG_KEYS = [
  'counsel_surfaces',
  'counsel_checkout',
  'offices',
  'record_desk',
  'clinic_inbox',
  'long_records',
  'family_part_b',
] as const

export type FlagKey = (typeof FLAG_KEYS)[number]
export type FlagMap = Record<FlagKey, boolean>

export const DARK: FlagMap = Object.freeze(
  Object.fromEntries(FLAG_KEYS.map((k) => [k, false])) as FlagMap
) as FlagMap

const coerce = (body: unknown): FlagMap => {
  const out = { ...DARK }
  if (body && typeof body === 'object') {
    for (const k of FLAG_KEYS) out[k] = (body as Record<string, unknown>)[k] === true
  }
  return out
}

/** Server-side: the effective flag map for the signed-in tenant. Never throws. */
export async function getFlags(): Promise<FlagMap> {
  try {
    // Imported here so this module stays importable from client components.
    const { cookies } = await import('next/headers')
    const store = await cookies()
    const cookie = store
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
    const res = await fetch(`${API_URL}/flags`, { headers: cookie ? { cookie } : {}, cache: 'no-store' })
    if (!res.ok) return { ...DARK }
    return coerce(await res.json())
  } catch {
    return { ...DARK }
  }
}

/** Client-side: `{ flags, loaded }`; `flags` is all-dark until the fetch lands. */
export function useFlags(): { flags: FlagMap; loaded: boolean } {
  const [flags, setFlags] = useState<FlagMap>({ ...DARK })
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    apiFetch('/flags')
      .then(async (r) => (r.ok ? coerce(await r.json()) : { ...DARK }))
      .catch(() => ({ ...DARK }))
      .then((map) => {
        if (!alive) return
        setFlags(map)
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return { flags, loaded }
}
