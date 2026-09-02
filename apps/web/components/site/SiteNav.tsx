'use client'

/**
 * Brand-site navigation (snotnoselegal_site_design.md §4) — used on the
 * informational pages ONLY. The conversion landing (/review) keeps its
 * minimal logo+CTA nav on purpose: its job is focus, this nav's job is
 * orientation. Links appear only for pages that exist (P2 adds How it
 * works and Learn).
 */
import Link from 'next/link'
import { useContent, LangSwitch } from '../../lib/i18n'

const NAV = {
  en: {
    pricing: 'Pricing',
    about: 'About',
    faq: 'FAQ',
    guide: 'Get your documents',
    cta: 'Start the free check',
  },
  es: {
    pricing: 'Precio',
    about: 'Quiénes somos',
    faq: 'Preguntas',
    guide: 'Consiga sus documentos',
    cta: 'Empiece la revisión gratis',
  },
}

export default function SiteNav() {
  const t = useContent(NAV)
  return (
    <nav className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2 px-5 py-5">
      <Link href="/" className="font-db-serif text-lg font-bold text-db-accent">
        Family Case Review
      </Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/pricing" className="hover:underline">
          {t.pricing}
        </Link>
        <Link href="/about" className="hover:underline">
          {t.about}
        </Link>
        <Link href="/faq" className="hover:underline">
          {t.faq}
        </Link>
        <Link href="/how-to-get-documents" className="hover:underline">
          {t.guide}
        </Link>
        <LangSwitch />
        <Link
          href="/check"
          className="inline-flex min-h-11 items-center rounded-full bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
        >
          {t.cta}
        </Link>
      </div>
    </nav>
  )
}
