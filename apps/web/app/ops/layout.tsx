'use client'

/**
 * OpsShell (ops_console_redesign.md F3): one persistent nav on EVERY /ops
 * page — as a layout, so per-page headers can't drift or dead-link again.
 * Industrial Authority palette (staff surface, not Daybreak).
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
      <div className="p-6">{children}</div>
    </div>
  )
}
