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
import { useStaffRole } from '@/lib/staff-role'
import { signOut, useSession } from 'next-auth/react'

const NAV: [string, string][] = [
  ['/ops', 'Overview'],
  ['/ops/holds', 'Holds'],
  ['/ops/cases', 'Cases'],
  // Professional era (staff_console.md §12): organisations and their pilots,
  // the bar-verification queue, Long-record quotes, the Record Desk queue.
  ['/ops/organisations', 'Organisations'],
  ['/ops/verifications', 'Verifications'],
  ['/ops/quotes', 'Quotes'],
  ['/ops/record-desk', 'Record Desk'],
  ['/ops/accounts', 'Accounts'],
  ['/ops/promos', 'Promos'],
  ['/ops/money', 'Money'],
  ['/ops/feedback', 'Feedback'],
  ['/ops/retention', 'Retention'],
  ['/ops/diagnostics', 'Diagnostics'],
  // The weekly eval gate (persona_rollout_plan.md §5 J): runs, scorecards,
  // cost per bucket, Run now. ADMIN only.
  ['/ops/eval', 'Eval gate'],
  // Dark professional surfaces and their per-organisation overrides
  // (staff_console.md §10). ADMIN flips; SUPPORT has no door here.
  ['/ops/flags', 'Flags'],
  // Staff accounts (staff_console.md §2): the Team page moved here from the
  // retired /dashboard build (workstream F, 2026-10-19).
  ['/ops/team', 'Team'],
]
// What a SUPPORT sign-in can open (staff_console_access_model §3): the
// customer-facing surfaces. Everything else isn't greyed out — it isn't there.
// The professional pages are read-only for Support (the api refuses the
// writes); the Record Desk lets Support move a request along.
const SUPPORT_NAV = new Set(['/ops', '/ops/cases', '/ops/organisations', '/ops/verifications', '/ops/quotes', '/ops/record-desk', '/ops/accounts', '/ops/feedback'])

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  const role = useStaffRole()
  const email = (useSession().data?.user as { email?: string | null } | undefined)?.email ?? null
  const nav = role === 'SUPPORT' ? NAV.filter(([href]) => SUPPORT_NAV.has(href)) : NAV
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
          <span className="font-serif text-lg font-bold text-[#D4AF37]">Snot Nose Legal · Operations</span>
          <nav data-testid="ops-nav" className="flex flex-wrap gap-1 text-sm">
            {nav.map(([href, label]) => {
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
          {/* Who is signed in + the way out. Testing the family flow from a
              staff session had no exit but clearing cookies (2026-09-09). */}
          <div className="flex items-center gap-3 text-xs text-[#8B949E]" data-testid="ops-session">
            <Link href="/ops/profile" className="rounded px-2 py-1 hover:bg-[#161B22] hover:text-[#E6EDF3]" title="Your profile" data-testid="ops-profile-link">
              {email ?? role ?? 'signed in'}{email && role ? ` · ${role.toLowerCase()}` : ''}
            </Link>
            <button
              type="button"
              onClick={() => void signOut({ callbackUrl: '/' })}
              className="rounded border border-[#30363D] px-2 py-1 text-[#E6EDF3] hover:border-[#8B949E]"
              data-testid="ops-sign-out"
            >
              Sign out
            </button>
          </div>
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
