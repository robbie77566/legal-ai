'use client'

/**
 * Brand-site navigation (snotnoselegal_site_design.md §4) — used on the
 * informational pages ONLY. The conversion landing (/review) keeps its
 * minimal logo+CTA nav on purpose: its job is focus, this nav's job is
 * orientation. Links appear only for pages that exist (P2 adds How it
 * works and Learn).
 */
import Link from 'next/link'
import { useContext } from 'react'
import { SessionContext } from 'next-auth/react'
import { useContent, LangSwitch } from '../../lib/i18n'
import { NamePill } from '../daybreak/NamePill'

const NAV = {
  en: {
    how: 'How it works',
    learn: 'Learn',
    pricing: 'Pricing',
    about: 'About',
    faq: 'FAQ',
    signIn: 'Sign in',
    reviews: 'Your reviews',
    guide: 'Get your documents',
    cta: 'Start the free check',
    ctaAgain: 'Start another review',
  },
  es: {
    how: 'Cómo funciona',
    learn: 'Aprenda',
    pricing: 'Precio',
    about: 'Quiénes somos',
    faq: 'Preguntas',
    signIn: 'Iniciar sesión',
    reviews: 'Sus revisiones',
    guide: 'Consiga sus documentos',
    cta: 'Empiece la revisión gratis',
    ctaAgain: 'Empiece otra revisión',
  },
}

export default function SiteNav() {
  const t = useContent(NAV)
  // Read the session without demanding a provider: brand pages render with
  // or without one, and a signed-in family gets a way back to their reviews
  // (customer_journey_ux_review G-C3).
  const session = useContext(SessionContext)
  const user = session?.data?.user as { name?: string | null; email?: string | null; role?: string } | undefined
  // Staff on the brand site go through the role-aware landing, not the family page.
  const pillHref = user?.role && user.role !== 'CLIENT' ? '/go' : '/account'
  const signedIn = !!user
  return (
    <nav className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-5 py-5">
      <Link href="/" className="font-db-serif text-lg font-bold text-db-accent">
        Family Case Review
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/how-it-works" className="hover:underline">
          {t.how}
        </Link>
        <Link href="/learn" className="hover:underline">
          {t.learn}
        </Link>
        <Link href="/pricing" className="hover:underline">
          {t.pricing}
        </Link>
        <Link href="/about" className="hover:underline">
          {t.about}
        </Link>
        <Link href="/faq" className="hover:underline">
          {t.faq}
        </Link>
        {signedIn ? (
          <NamePill name={user?.name} email={user?.email} compact href={pillHref} />
        ) : (
          <Link href="/auth/signin" className="text-db-muted underline" data-testid="nav-signin">
            {t.signIn}
          </Link>
        )}
        <LangSwitch />
        <Link
          href="/check"
          className="inline-flex min-h-11 items-center rounded-full bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
        >
          {signedIn ? t.ctaAgain : t.cta}
        </Link>
      </div>
    </nav>
  )
}
