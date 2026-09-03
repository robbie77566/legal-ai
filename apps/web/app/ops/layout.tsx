'use client'

/**
 * OpsShell (ops_console_redesign.md F3): one persistent nav on EVERY /ops
 * page — as a layout, so per-page headers can't drift or dead-link again.
 * Industrial Authority palette (staff surface, not Daybreak).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

const NAV: [string, string][] = [
  ['/ops', 'Overview'],
  ['/ops/holds', 'Holds'],
  ['/ops/accounts', 'Accounts'],
  ['/ops/promos', 'Promos'],
  ['/ops/feedback', 'Feedback'],
  ['/ops/retention', 'Retention'],
]

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  // The API rejecting the browser's session (cookie not reaching api.* or a
  // NEXTAUTH_SECRET mismatch between services) made every ops page render
  // EMPTY instead of saying so — an hour lost on 2026-09-02. Probe once.
  const [apiAuth, setApiAuth] = useState<'ok' | 'rejected' | 'unknown'>('unknown')
  useEffect(() => {
    void apiFetch('/ops/status').then((r) => setApiAuth(r.status === 401 || r.status === 403 ? 'rejected' : 'ok')).catch(() => setApiAuth('rejected'))
  }, [])
  return (
    <div className="min-h-screen bg-[#0B0E14] font-sans text-[#E6EDF3]">
      <header className="border-b border-[#30363D] px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-serif text-lg font-bold text-[#D4AF37]">Operations</span>
          <nav data-testid="ops-nav" className="flex flex-wrap gap-1 text-sm">
            {NAV.map(([href, label]) => {
              const active = href === '/ops' ? path === '/ops' : path.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded px-3 py-1.5 ${active ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E] hover:text-[#E6EDF3]'}`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      {apiAuth === 'rejected' && (
        <div role="alert" data-testid="api-auth-banner" className="border-b border-[#F85149] bg-[#F85149]/10 px-6 py-3 text-sm text-[#F85149]">
          The API is rejecting your session, so every page here will look empty. You are signed in on the site, but
          <span className="font-mono"> api.snotnoselegal.com </span> can&rsquo;t verify the cookie — either <span className="font-mono">COOKIE_DOMAIN</span> is missing on the web service or <span className="font-mono">NEXTAUTH_SECRET</span> differs between web and api. Fix the env, then sign out and back in.
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  )
}
