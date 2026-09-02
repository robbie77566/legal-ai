import Link from 'next/link'

/**
 * Daybreak site footer — quiet legal ground on every consumer page: who
 * operates the service, how to reach a human, the no-advice line families
 * must never lose sight of, and the policy pages. Small, muted, honest —
 * never competing with the page's one CTA. Extra bottom padding clears the
 * landing page's sticky mobile CTA bar.
 */
export default function SiteFooter() {
  const year = Math.max(new Date().getFullYear(), 2027)
  return (
    <footer className="mt-12 border-t border-db-line pb-24 pt-8 sm:pb-8">
      <div className="mx-auto max-w-2xl space-y-3 px-5 text-sm text-db-muted">
        <p>
          <span className="font-db-serif font-semibold text-db-ink">Family Case Review</span> — a
          service of Snot Nose Legal, operated by{' '}
          <a href="https://tangentsolutionz.com" className="underline" rel="noopener">
            Tangent Solutions LLC
          </a>
          .
        </p>
        <p>
          We are not a law firm and do not provide legal advice. Our reports are information about
          what is in a court record, prepared for you to share with a licensed attorney.
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <a href="mailto:admin@snotnoselegal.com" className="underline">
            admin@snotnoselegal.com
          </a>
          <Link href="/pricing" className="underline">
            Pricing
          </Link>
          <Link href="/about" className="underline">
            About
          </Link>
          <Link href="/faq" className="underline">
            FAQ
          </Link>
          <Link href="/contact" className="underline">
            Contact
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
        <p>© {year} Tangent Solutions LLC. All rights reserved.</p>
      </div>
    </footer>
  )
}
