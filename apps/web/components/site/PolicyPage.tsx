'use client'

import Link from 'next/link'
import { useContent } from '../../lib/i18n'
import NotASubstitute from '../NotASubstitute'

/**
 * The shape of a policy page (Terms, Refund policy — UPL review 2026-10-23,
 * rec 10): the DRAFT banner first, the title, the one statement at body size,
 * plain sections, and the links to the sibling policy pages. Same quiet
 * layout as /disclosures and /privacy.
 */
export interface PolicyContent {
  draft: string
  title: string
  intro: string
  sections: [string, string][]
  related: string
}

const LINKS = {
  en: { terms: 'Terms of service', refund: 'Refund policy', disclosures: 'Disclosures', privacy: 'Privacy' },
  es: { terms: 'Términos del servicio', refund: 'Política de reembolso', disclosures: 'Divulgaciones', privacy: 'Privacidad' },
}

export default function PolicyPage({ content, testId }: { content: { en: PolicyContent; es: PolicyContent }; testId: string }) {
  const t = useContent(content)
  const l = useContent(LINKS)
  return (
    <main className="mx-auto max-w-xl px-5 py-8" data-testid={testId}>
      <p className="mb-4 rounded-xl border border-db-line p-3 text-sm text-db-muted" data-testid="policy-draft">
        {t.draft}
      </p>
      <h1 className="font-db-serif text-3xl font-semibold">{t.title}</h1>
      <p className="mt-3">{t.intro}</p>
      <NotASubstitute className="mt-4 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4" />
      {t.sections.map(([heading, body]) => (
        <section key={heading} className="mt-6">
          <h2 className="font-db-serif text-xl font-semibold">{heading}</h2>
          <p className="mt-2">{body}</p>
        </section>
      ))}
      <p className="mt-8 text-sm text-db-muted">{t.related}</p>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/terms" className="underline">{l.terms}</Link>
        <Link href="/refund-policy" className="underline">{l.refund}</Link>
        <Link href="/disclosures" className="underline">{l.disclosures}</Link>
        <Link href="/privacy" className="underline">{l.privacy}</Link>
      </p>
    </main>
  )
}
