'use client'

import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'
import { useContent } from '../lib/i18n'
import NotASubstitute from './NotASubstitute'

/**
 * Daybreak site footer — quiet legal ground on every consumer page: who
 * operates the service, how to reach a human, the one statement families
 * must never lose sight of (from `@hg/case-lifecycle` NOT_A_LAW_FIRM, in the
 * current language), and the policy pages. Small, muted, honest — never
 * competing with the page's one CTA. Extra bottom padding clears the landing
 * page's sticky mobile CTA bar.
 */
const FOOTER = {
  en: {
    operatedBy: 'operated by',
    pricing: 'Pricing',
    about: 'About',
    faq: 'FAQ',
    contact: 'Contact',
    terms: 'Terms',
    refund: 'Refund policy',
    disclosures: 'Disclosures',
    privacy: 'Privacy',
    accessibility: 'Accessibility',
    forCounsel: 'For counsel',
    rights: 'All rights reserved.',
  },
  es: {
    operatedBy: 'operado por',
    pricing: 'Precio',
    about: 'Quiénes somos',
    faq: 'Preguntas',
    contact: 'Contacto',
    terms: 'Términos',
    refund: 'Política de reembolso',
    disclosures: 'Divulgaciones',
    privacy: 'Privacidad',
    accessibility: 'Accesibilidad',
    forCounsel: 'Para abogados',
    rights: 'Todos los derechos reservados.',
  },
}

export default function SiteFooter() {
  const t = useContent(FOOTER)
  const year = Math.max(new Date().getFullYear(), 2027)
  return (
    <footer className="mt-12 border-t border-db-line pb-24 pt-8 sm:pb-8">
      <div className="mx-auto max-w-2xl space-y-3 px-5 text-sm text-db-muted">
        <p>
          <span className="font-db-serif font-semibold text-db-ink">{BRAND.name}</span> · {BRAND.tagline} — {t.operatedBy}{' '}
          <a href={BRAND.operatorUrl} className="underline" rel="noopener">
            {BRAND.operator}
          </a>
          .
        </p>
        <NotASubstitute className="text-sm" />
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={`mailto:${BRAND.email}`} className="underline">
            {BRAND.email}
          </a>
          <Link href="/pricing" className="underline">
            {t.pricing}
          </Link>
          <Link href="/about" className="underline">
            {t.about}
          </Link>
          <Link href="/faq" className="underline">
            {t.faq}
          </Link>
          <Link href="/contact" className="underline">
            {t.contact}
          </Link>
          <Link href="/terms" className="underline" data-testid="footer-terms">
            {t.terms}
          </Link>
          <Link href="/refund-policy" className="underline" data-testid="footer-refund-policy">
            {t.refund}
          </Link>
          <Link href="/disclosures" className="underline">
            {t.disclosures}
          </Link>
          <Link href="/privacy" className="underline">
            {t.privacy}
          </Link>
          <Link href="/accessibility" className="underline">
            {t.accessibility}
          </Link>
          {/* The one crossing between the two audiences (persona_rollout_plan.md
              §3): a text link in the footer, never in the family nav. */}
          <Link href="/for-counsel" className="underline" data-testid="footer-for-counsel">
            {t.forCounsel}
          </Link>
        </p>
        <p>© {year} {BRAND.operator}. {t.rights}</p>
      </div>
    </footer>
  )
}
