import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'
import { FOR_COUNSEL as C, LADDER, LONG_FROM } from '../../../lib/content/professional'
import SamplePartB from '../../../components/professional/SamplePartB'
import PilotInterestForm from '../../../components/professional/PilotInterestForm'
import SignupStatus from '../../../components/professional/SignupStatus'

/**
 * /for-counsel — the nine sections of professional_tier_expansion.md §6.2 in
 * order, on the ADOPTED ladder (persona_rollout_plan.md §4): hero, the
 * packet, how it fits the work, what it is not, pricing, trust, the PD
 * pilot, sign-up, FAQ. No eligibility wizard, no family copy, no link to
 * /review or /check. Section headings carry ids so the e2e spec can assert
 * their order.
 */
export const metadata: Metadata = {
  title: `Counsel Review — ${BRAND.name}`,
  description: `Every preserved objection, IAC, Brady, 11.073 and sentencing finding in a Texas trial record, cited to volume, page and line. $${LADDER[0].price}, $${LADDER[1].price} or $${LADDER[2].price} by record length; Long records by quote from $${LONG_FROM}.`,
}

const h2 = 'font-db-serif text-2xl font-semibold'
const card = 'rounded-xl border border-db-line bg-db-surface p-5'

export default function ForCounsel() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-12">
      {/* 1. Hero */}
      <section id="hero" aria-labelledby="hero-heading" className="pt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">Counsel Review · Texas criminal records</p>
        <h1 id="hero-heading" className="mt-2 font-db-serif text-4xl font-bold leading-tight">{C.hero.heading}</h1>
        <p className="mt-4 text-lg text-db-muted">{C.hero.sub}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/for-counsel/signup" className="inline-flex min-h-12 items-center rounded-xl bg-db-accent px-6 py-3 text-lg font-semibold text-db-surface" data-testid="cta-counsel-review">
            {C.hero.ctaPrimary}
          </Link>
          <a href="#pilot" className="inline-flex min-h-12 items-center rounded-xl border-2 border-db-accent px-6 py-3 text-lg font-semibold text-db-accent" data-testid="cta-pilot">
            {C.hero.ctaSecondary}
          </a>
        </div>
        <p className="mt-3 text-sm text-db-muted">{C.hero.micro}</p>
      </section>

      {/* 2. The packet */}
      <section id="packet" aria-labelledby="packet-heading" className="mt-14">
        <h2 id="packet-heading" className={h2}>{C.packet.heading}</h2>
        <p className="mt-2 text-db-muted">{C.packet.lead}</p>
        <div className="mt-5">
          <SamplePartB />
        </div>
      </section>

      {/* 3. How it fits the work */}
      <section id="fit" aria-labelledby="fit-heading" className="mt-14">
        <h2 id="fit-heading" className={h2}>{C.fit.heading}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {C.fit.columns.map((col) => (
            <div key={col.title} className={card}>
              <h3 className="font-db-serif text-lg font-semibold">{col.title}</h3>
              <ul className="mt-3 space-y-2 text-[15px]">
                {col.items.map((item) => (
                  <li key={item} className="border-l-2 border-db-line pl-3">{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* 4. What it is not */}
      <section id="not" aria-labelledby="not-heading" className="mt-14">
        <h2 id="not-heading" className={h2}>{C.not.heading}</h2>
        <dl className="mt-4 space-y-3">
          {C.not.items.map((item) => (
            <div key={item.title} className={card}>
              <dt className="font-semibold">{item.title}</dt>
              <dd className="mt-1 text-[15px] text-db-muted">
                {item.body.includes('vLex') ? (
                  <>
                    It reads one trial record. For case law, use a research platform such as{' '}
                    <a href="https://vlex.com" rel="noopener noreferrer" target="_blank" className="underline">vLex</a> or Westlaw.
                  </>
                ) : (
                  item.body
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 5. Pricing */}
      <section id="pricing" aria-labelledby="pricing-heading" className="mt-14">
        <h2 id="pricing-heading" className={h2}>{C.pricing.heading}</h2>
        <p className="mt-2 text-db-muted">{C.pricing.lead}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-3" data-testid="ladder">
          {LADDER.map((r) => (
            <div key={r.rung} className={card} data-testid={`ladder-${r.rung}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">Counsel Review {r.label}</p>
              <p className="mt-1 font-db-serif text-3xl font-bold">${r.price}</p>
              <p className="mt-1 text-sm text-db-muted">Reporter&rsquo;s record {r.pages}</p>
            </div>
          ))}
        </div>
        <ul className="mt-4 space-y-1.5 text-[15px]">
          <li>{C.pricing.long}</li>
          <li>{C.pricing.pack}</li>
          <li>{C.pricing.firstFree}</li>
          <li>{C.pricing.rerun}</li>
        </ul>
        <p className="mt-4 text-sm text-db-muted">{C.pricing.note}</p>
      </section>

      {/* 6. Trust */}
      <section id="trust" aria-labelledby="trust-heading" className="mt-14">
        <h2 id="trust-heading" className={h2}>{C.trust.heading}</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {C.trust.items.map((item) => (
            <div key={item.title} className={card}>
              <dt className="font-semibold">{item.title}</dt>
              <dd className="mt-1 text-[15px] text-db-muted">{item.body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-db-muted">
          The security one-pager written for an office&rsquo;s procurement file is at <Link href="/for-offices/security" className="underline">/for-offices/security</Link>.
        </p>
      </section>

      {/* 7. Public defender pilot */}
      <section id="pilot" aria-labelledby="pilot-heading" className="mt-14">
        <h2 id="pilot-heading" className={h2}>{C.pilot.heading}</h2>
        <p className="mt-2 text-lg">{C.pilot.offer}</p>
        <p className="mt-2 text-[15px] text-db-muted">{C.pilot.ask}</p>
        <p className="mt-2 text-[15px] text-db-muted">{C.pilot.grant}</p>
        <p className="mt-2 text-[15px] text-db-muted">{C.pilot.threshold}</p>
        <div className="mt-5">
          <PilotInterestForm lead={C.pilot.formLead} />
        </div>
        <p className="mt-3 text-sm text-db-muted">
          The office page says more: <Link href="/for-offices" className="underline">/for-offices</Link>.
        </p>
      </section>

      {/* 8. Sign-up */}
      <section id="signup" aria-labelledby="signup-heading" className="mt-14">
        <h2 id="signup-heading" className={h2}>{C.signup.heading}</h2>
        <p className="mt-2 text-[15px] text-db-muted">{C.signup.body}</p>
        <div className="mt-4">
          <SignupStatus />
        </div>
        <Link href="/for-counsel/signup" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-db-accent px-6 py-3 text-lg font-semibold text-db-surface" data-testid="cta-signup">
          {C.signup.cta}
        </Link>
      </section>

      {/* 9. FAQ */}
      <section id="faq" aria-labelledby="faq-heading" className="mt-14">
        <h2 id="faq-heading" className={h2}>{C.faq.heading}</h2>
        <div className="mt-4 space-y-2">
          {C.faq.items.map((item) => (
            <details key={item.q} className={card}>
              <summary className="cursor-pointer font-semibold">{item.q}</summary>
              <p className="mt-2 text-[15px] text-db-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </main>
  )
}
