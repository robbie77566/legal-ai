import type { Metadata } from 'next'
import { BRAND } from '@hg/case-lifecycle'

/**
 * The professional surface's shell (persona_rollout_plan.md §5 A, F). Thin by
 * design: not the Daybreak family skin and not the ops console. Workstream F
 * replaces it with ProfessionalNav; until then it carries only the brand line
 * so the route group has its own layout and nothing family-facing leaks in.
 */
export const metadata: Metadata = {
  title: `Counsel — ${BRAND.name}`,
  robots: { index: false, follow: false },
}

export default function CounselLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <header className="border-b border-slate-200 px-6 py-3">
        <span className="font-serif text-lg font-semibold">{BRAND.name} · Counsel</span>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-10">{children}</main>
    </div>
  )
}
