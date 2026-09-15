'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { API_URL } from '@/lib/api'

/**
 * Feeds the admin's Accounts page (visits, time on site). Posts a pageview
 * on every route change and a heartbeat every minute while the tab is
 * visible; one last beat when the tab is hidden or the page unloads so the
 * visit's end is recorded. Signed-in users only; a failed beat is ignored.
 */
const HEARTBEAT_MS = 60_000

function beat(pageview: boolean, keepalive = false): void {
  void fetch(`${API_URL}/me/visit`, {
    method: 'POST',
    credentials: 'include',
    keepalive,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageview }),
  }).catch(() => {})
}

export default function VisitTracker() {
  const { status } = useSession()
  const pathname = usePathname()
  const signedIn = status === 'authenticated'

  useEffect(() => {
    if (signedIn) beat(true)
  }, [signedIn, pathname])

  useEffect(() => {
    if (!signedIn) return
    const tick = () => { if (document.visibilityState === 'visible') beat(false) }
    const onVisibility = () => { if (document.visibilityState === 'hidden') beat(false, true) }
    const onPageHide = () => beat(false, true)
    const id = setInterval(tick, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [signedIn])

  return null
}
