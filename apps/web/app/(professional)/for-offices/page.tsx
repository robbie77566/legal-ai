import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'
import { FOR_OFFICES as O, OFFICE_PLANS, PILOT } from '../../../lib/content/professional'
import PilotInterestForm from '../../../components/professional/PilotInterestForm'

/**
 * /for-offices — the public defender office page (persona_rollout_plan.md
 * §3 PD appellate attorney, §4): the free pilot, Office 50/120/250 by quote,
 * unlimited users with free investigator and viewer seats, ACH invoicing,
 * the security one-pager, the pilot form.
 */
export const metadata: Metadata = {
  title: `For public defender offices — ${BRAND.name}`,
  description: `A ${PILOT.days}-day, ${PILOT.records}-record pilot for Texas public defender offices, free. Office plans by quote, unlimited users, ACH invoicing.`,
}

const h2 = 'font-db-serif text-2xl font-semibold'
const card = 'rounded-xl border border-db-line bg-db-surface p-5'

export default function ForOffices() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-12">
      <section id="hero" aria-labelledby="offices-hero" className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">For public defender offices</p>
        <h1 id="offices-hero" className="mt-2 font-db-serif text-4xl font-bold leading-tight">{O.hero.heading}</h1>
        <p className="mt-4 text-lg text-db-muted">{O.hero.sub}</p>
        <a href="#pilot-form" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-db-accent px-6 py-3 text-lg font-semibold text-db-surface" data-testid="cta-pilot">
          Start the free pilot
        </a>
      </section>

      <section id="pilot" aria-labelledby="pilot-heading" className="mt-14">
        <h2 id="pilot-heading" className={h2}>{O.pilot.heading}</h2>
        <div className={`mt-4 ${card}`} data-testid="pilot-offer">
          <p className="font-db-serif text-3xl font-bold">
            {PILOT.records} records · {PILOT.days} days · free
          </p>
          <p className="mt-2 text-[15px] text-db-muted">{O.pilot.body}</p>
        </div>
      </section>

      <section id="plans" aria-labelledby="plans-heading" className="mt-14">
        <h2 id="plans-heading" className={h2}>{O.plans.heading}</h2>
        <p className="mt-2 text-db-muted">{O.plans.lead}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3" data-testid="office-plans">
          {OFFICE_PLANS.map((p) => (
            <div key={p.name} className={card}>
              <p className="font-db-serif text-xl font-semibold">{p.name}</p>
              <p className="mt-1 text-sm text-db-muted">{p.records} records a year</p>
              <p className="mt-2 font-semibold">By quote</p>
            </div>
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 text-[15px]">
          <li>{O.plans.seats}</li>
          <li>{O.plans.billing}</li>
          <li>An allowance is drawn down once per record at analysis start; the pilot&rsquo;s fifteen records count the same way.</li>
        </ul>
      </section>

      <section id="security" aria-labelledby="security-heading" className="mt-14">
        <h2 id="security-heading" className={h2}>{O.security.heading}</h2>
        <p className="mt-2 text-[15px] text-db-muted">{O.security.body}</p>
        <Link href="/for-offices/security" className="mt-4 inline-flex min-h-11 items-center rounded-xl border-2 border-db-accent px-5 py-2.5 font-semibold text-db-accent" data-testid="security-link">
          {O.security.cta}
        </Link>
      </section>

      <section id="pilot-form" aria-labelledby="form-heading" className="mt-14">
        <h2 id="form-heading" className={h2}>{O.form.heading}</h2>
        <div className="mt-4">
          <PilotInterestForm lead={O.form.lead} idPrefix="office-pilot" />
        </div>
      </section>
    </main>
  )
}
