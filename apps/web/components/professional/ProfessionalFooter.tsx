import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'

/**
 * Footer for the professional pages: the operator, the no-advice line in its
 * professional form (work product prepared at counsel's direction), the
 * security page and the policy pages. No family links — the family site is
 * reached only by typing it.
 */
export default function ProfessionalFooter() {
  const year = Math.max(new Date().getFullYear(), 2027)
  return (
    <footer data-testid="professional-footer" className="mt-12 border-t border-db-line pb-8 pt-8">
      <div className="mx-auto max-w-3xl space-y-3 px-5 text-sm text-db-muted">
        <p>
          <span className="font-db-serif font-semibold text-db-ink">{BRAND.name}</span> — operated by{' '}
          <a href={BRAND.operatorUrl} className="underline" rel="noopener">
            {BRAND.operator}
          </a>
          .
        </p>
        <p>
          We are not a law firm and do not provide legal advice. A Counsel Review is a record screen prepared at
          counsel&rsquo;s direction for counsel&rsquo;s use; no attorney-client relationship is created with us.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a href={`mailto:${BRAND.email}`} className="underline">
            {BRAND.email}
          </a>
          <Link href="/for-offices/security" className="underline">
            Security
          </Link>
          <Link href="/disclosures" className="underline">
            Disclosures
          </Link>
          <Link href="/privacy" className="underline">
            Privacy
          </Link>
          <Link href="/accessibility" className="underline">
            Accessibility
          </Link>
        </p>
        <p>© {year} {BRAND.operator}. All rights reserved.</p>
      </div>
    </footer>
  )
}
