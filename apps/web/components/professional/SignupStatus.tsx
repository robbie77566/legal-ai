'use client'

/**
 * Are professional sign-ups open? Reads the public GET /counsel/signup (the
 * GLOBAL counsel_surfaces flag). Anything but `{ open: true }` — a 401, an
 * outage, a dark flag — is treated as closed, so the page never promises a
 * door that is not there. `useSignupOpen` is shared by the /for-counsel §8
 * block and the sign-up page itself.
 */
import { useEffect, useState } from 'react'
import { counselSignupOpen } from '@/lib/api'

export const SIGNUPS_CLOSED = 'Sign-ups open January 2027.'

export function useSignupOpen(): { open: boolean; loaded: boolean } {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    counselSignupOpen()
      .then(async (r) => r.ok && ((await r.json().catch(() => ({}))) as { open?: boolean }).open === true)
      .catch(() => false)
      .then((v) => {
        if (!alive) return
        setOpen(v)
        setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return { open, loaded }
}

export default function SignupStatus() {
  const { open, loaded } = useSignupOpen()
  if (!loaded) return <p className="text-sm text-db-muted" aria-live="polite">Checking whether sign-ups are open…</p>
  if (!open) {
    return (
      <p data-testid="signups-closed" className="rounded-xl border border-db-line bg-db-surface p-4 text-[15px]">
        {SIGNUPS_CLOSED} Until then, the pilot form above reaches the founder directly.
      </p>
    )
  }
  return (
    <p data-testid="signups-open" className="text-[15px]">
      Sign-ups are open. Your account is ready the moment you finish the form; the bar number is verified by a person afterwards.
    </p>
  )
}
