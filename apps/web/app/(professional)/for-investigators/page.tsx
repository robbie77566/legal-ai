import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'
import { FOR_INVESTIGATORS as I } from '../../../lib/content/professional'
import PilotInterestForm from '../../../components/professional/PilotInterestForm'

/**
 * /for-investigators — the investigator page (persona_rollout_plan.md §3
 * investigator, §5 I): free membership inside a firm or office, the
 * chronology as a Record Desk service delivered by hand, the request form
 * explained. Prices are "on request" by design — the plan sets them by
 * mid-December; nothing here invents a number.
 */
export const metadata: Metadata = {
  title: `For investigators — ${BRAND.name}`,
  description: 'Free investigator membership inside a firm or public defender office; the record chronology as a Record Desk service, cited to volume, page and line.',
}

const h2 = 'font-db-serif text-2xl font-semibold'
const card = 'rounded-xl border border-db-line bg-db-surface p-5'

export default function ForInvestigators() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-12">
      <section id="hero" aria-labelledby="inv-hero" className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">For investigators</p>
        <h1 id="inv-hero" className="mt-2 font-db-serif text-4xl font-bold leading-tight">{I.hero.heading}</h1>
        <p className="mt-4 text-lg text-db-muted">{I.hero.sub}</p>
      </section>

      <section id="membership" aria-labelledby="membership-heading" className="mt-14">
        <h2 id="membership-heading" className={h2}>{I.membership.heading}</h2>
        <p className="mt-2 text-[15px]">{I.membership.body}</p>
      </section>

      <section id="service" aria-labelledby="service-heading" className="mt-14">
        <h2 id="service-heading" className={h2}>{I.service.heading}</h2>
        <p className="mt-2 text-[15px]">{I.service.body}</p>
        <p className={`mt-4 ${card} font-semibold`} data-testid="investigator-price">{I.service.price}</p>
      </section>

      <section id="request" aria-labelledby="request-heading" className="mt-14">
        <h2 id="request-heading" className={h2}>{I.request.heading}</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px]">
          {I.request.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>

      <section id="seat" aria-labelledby="seat-heading" className="mt-14">
        <h2 id="seat-heading" className={h2}>{I.cta.heading}</h2>
        <p className="mt-2 text-[15px]">{I.cta.body}</p>
        <p className="mt-3 text-sm text-db-muted">
          Already invited? The link in the email takes your seat; then <Link href="/auth/signin?callbackUrl=/go" className="underline">sign in</Link>.
        </p>
        <div className="mt-5">
          <PilotInterestForm lead="For an office that wants the pilot and seats for its investigators." idPrefix="investigator-pilot" />
        </div>
      </section>
    </main>
  )
}
