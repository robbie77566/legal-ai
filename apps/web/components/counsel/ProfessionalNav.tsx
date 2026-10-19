'use client'

/**
 * ProfessionalNav (persona_rollout_plan.md §5 F): Matters · Organisation ·
 * Inbox (CLINIC only) · Record Desk (when record_desk is on) · Account, plus
 * the organisation's name and the way out. Never the family nav, never the
 * staff nav. The item list is the pure `navItemsFor` so it is unit-tested
 * per organisation kind and flag.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { BRAND } from '@hg/case-lifecycle'
import { navItemsFor } from '@/lib/counsel'
import { useCounsel } from './CounselContext'

export default function ProfessionalNav() {
  const path = usePathname() ?? ''
  const { me, flags } = useCounsel()
  const items = navItemsFor(me?.organisation.kind ?? null, flags)
  return (
    <header className="border-b border-db-line bg-db-surface">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/counsel" className="font-db-serif text-lg font-semibold">
            {BRAND.name} <span className="text-db-muted">· Counsel</span>
          </Link>
          {me && <span className="text-sm text-db-muted" data-testid="nav-organisation">{me.organisation.name}</span>}
        </div>
        <nav aria-label="Professional" data-testid="professional-nav" className="flex flex-wrap gap-1 text-sm">
          {items.map((item) => {
            const active = item.href === '/counsel' ? path === '/counsel' || path.startsWith('/counsel/matters') : path.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`rounded-full px-3 py-1.5 ${active ? 'bg-db-accent-soft font-semibold text-db-ink' : 'text-db-muted hover:text-db-ink'}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm text-db-muted" data-testid="professional-session">
          {me && <span className="font-db-mono text-xs">{me.user.email}</span>}
          <button type="button" onClick={() => void signOut({ callbackUrl: '/for-counsel' })} className="rounded-full border border-db-line px-3 py-1" data-testid="professional-sign-out">
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
