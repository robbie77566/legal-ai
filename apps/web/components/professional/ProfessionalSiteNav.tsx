'use client'

/**
 * Navigation for the professional marketing pages (persona_rollout_plan.md
 * §3 "separate routes, navigation and sign-in landings"). Three audiences,
 * three pages, one sign-in. Nothing here points at the family site: the logo
 * itself goes to /for-counsel.
 */
import Link from 'next/link'
import BrandLogo from '../daybreak/BrandLogo'

export const PROFESSIONAL_SITE_NAV: ReadonlyArray<[string, string]> = [
  ['/for-counsel', 'For counsel'],
  ['/for-offices', 'For offices'],
  ['/for-investigators', 'For investigators'],
]

export default function ProfessionalSiteNav() {
  return (
    <nav aria-label="Professional site" data-testid="professional-site-nav" className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-5">
      <BrandLogo size="nav" href="/for-counsel" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {PROFESSIONAL_SITE_NAV.map(([href, label]) => (
          <Link key={href} href={href} className="hover:underline">
            {label}
          </Link>
        ))}
        <Link href="/auth/signin?callbackUrl=/go" className="text-db-muted underline" data-testid="nav-signin">
          Sign in
        </Link>
        <Link
          href="/for-counsel/signup"
          className="inline-flex min-h-11 items-center rounded-full bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
          data-testid="nav-signup"
        >
          Open an account
        </Link>
      </div>
    </nav>
  )
}
