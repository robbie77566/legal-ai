import Link from 'next/link'
import CtaLink from '../../components/ab/CtaLink'
import PaletteExperiment from '../../components/ab/PaletteExperiment'

/**
 * Daybreak landing (landing_page_spec.md §2). The conversion event is the
 * FREE eligibility check, not the sale — one CTA, repeated. Copy below is
 * the §2 canon: changes require R-5 tone review.
 */

const CTA = 'See if this fits your case — free, 2 minutes'

const CHECKS = [
  'Mistakes the trial lawyer may have made',
  "Evidence the State didn't turn over",
  "Forensic science that's since been discredited",
  'Sentence and jail-time-credit errors',
  'Deadlines that still matter — including "if the lawyer never filed the appeal you asked for, that itself can be a claim"',
]

const FAQ: [string, string][] = [
  [
    'Is this legal advice?',
    'No. This is a detailed review of court records — information to help you and a lawyer decide what to do next. We are not a law firm, and no attorney-client relationship is created. We never recommend filing anything on your own; a report is something to take to a lawyer.',
  ],
  [
    "Couldn't I just paste the record into ChatGPT?",
    "You could — and for a decision this final, you shouldn't. A general chatbot wasn't built for this: a trial record runs hundreds or thousands of pages (most tools can't even hold it all), and when a chatbot is unsure, it can confidently make things up — with no way for you to tell. Our system is engineered for exactly this job: it analyzes your complete record in multiple specialized passes built around Texas post-conviction law, and it is forbidden by design from showing you anything it can't back with an exact quote from your documents — every finding is mechanically re-verified against the record, every time you look at it. In Texas, the first writ is effectively the only writ. That's not a job for a general-purpose chatbot.",
  ],
  [
    "Couldn't I just paste the record into ChatGPT?",
    "You could — and for a decision this final, you shouldn't. A general chatbot wasn't built for this: a trial record runs hundreds or thousands of pages (most tools can't even hold it all), and when a chatbot is unsure, it can confidently make things up — with no way for you to tell. Our system is engineered for exactly this job: it analyzes your complete record in multiple specialized passes built around Texas post-conviction law, and it is forbidden by design from showing you anything it can't back with an exact quote from your documents — every finding is mechanically re-verified against the record, every time you look at it. In Texas, the first writ is effectively the only writ. That's not a job for a general-purpose chatbot.",
  ],
  [
    'What if the news is bad?',
    'We tell you straight, with dignity, and there is always a next step — whatever we find, including nothing.',
  ],
  [
    "What documents do I need — and what if I can't get them?",
    'After you buy, a short interview builds your personal checklist, and every item comes with "here\'s how to get it" guidance. If there was a direct appeal, the trial transcript usually already exists.',
  ],
  [
    'Who sees our records?',
    'Your records are encrypted, seen only by our review team, kept 12 months, and deleted sooner on request.',
  ],
  [
    'How long does it take?',
    'Your review clock starts when your documents are complete — we tell you the moment that happens, and we email you at every step.',
  ],
  [
    '¿Está disponible en español?',
    'Próximamente. Ayuda en español está en camino.',
  ],
]

export default function DaybreakLanding() {
  return (
    <main className="mx-auto max-w-2xl px-5 pb-28 sm:pb-16">
      <PaletteExperiment pingView />
      {/* Mobile thumb-zone CTA: the primary action stays reachable while the
          page scrolls; hidden on >=sm where the inline CTAs are in view. */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-db-line bg-db-surface p-3 sm:hidden"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <CtaLink
          href="/check"
          position="sticky"
          className="block w-full rounded-xl bg-db-accent px-6 py-4 text-center text-lg font-semibold text-db-surface"
        >
          Free 2-minute check
        </CtaLink>
      </div>
      {/* Nav: brand + single CTA, no menu */}
      <nav className="flex items-center justify-between py-5">
        <span className="font-db-serif text-lg font-bold text-db-accent">Family Case Review</span>
        <CtaLink
          href="/check"
          position="nav"
          className="inline-flex min-h-11 items-center rounded-full bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
        >
          See if this fits — free
        </CtaLink>
      </nav>

      {/* Hero */}
      <header className="py-10">
        <h1 className="font-db-serif text-4xl font-bold leading-tight">
          Find out what&rsquo;s really in the court record — before you spend thousands.
        </h1>
        <p className="mt-5 text-db-muted">
          World-class AI, built for one job: Texas post-conviction. It reads every page of your
          loved one&rsquo;s trial record, screens it for the problems that win appeals and writs,
          and backs every finding with the exact page and quote — explained in plain English.{' '}
          <strong className="text-db-ink">$299. One price, no per-page fees.</strong>
        </p>
        <CtaLink
          href="/check"
          position="hero"
          className="mt-7 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {CTA}
        </CtaLink>
        <p className="mt-3 text-sm text-db-muted">
          Free 2-minute check · Not a law firm · Information, not legal advice
        </p>
      </header>

      {/* The problem (anchor) */}
      <section className="rounded-xl border border-db-line bg-db-surface p-6">
        <p>
          A lawyer charges about <strong>$3,000</strong> just to read the file and tell you if a
          writ is worth pursuing. Full representation runs $15,000 or more. Most families decide
          blind — or don&rsquo;t decide at all.
        </p>
      </section>

      {/* How it works */}
      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">How it works</h2>
        <ol className="mt-4 space-y-4">
          {[
            'Answer a few questions (free).',
            'Send the court documents — we show you how to get them, and you can upload photos from your phone.',
            'Get your report: plain-English findings plus a packet any lawyer can use.',
          ].map((step, i) => (
            <li key={i} className="flex gap-4">
              <span className="font-db-mono text-db-accent">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-db-muted">
          Most reviews are ready within 10 business days of your documents being complete.
        </p>
      </section>

      {/* What we look for */}
      <section className="py-4">
        <h2 className="font-db-serif text-2xl font-semibold">What we look for</h2>
        <ul className="mt-4 space-y-3">
          {CHECKS.map((c) => (
            <li key={c} className="rounded-xl border border-db-line bg-db-surface p-4">
              {c}
              <span className="mt-1 block text-sm text-db-muted">
                Backed by page-and-line citations you can verify.
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-db-muted">
          Powered by careful AI analysis — and checked by a person, every time.
        </p>
      </section>

      {/* The report */}
      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">Your report, two parts</h2>
        <p className="mt-3">
          <strong>Part A is for you:</strong> what we reviewed, what we found, what it means, and
          what to do next — in plain English. <strong>Part B is for your lawyer:</strong> every
          finding with volume, page, and line citations, a timeline, and source excerpts.
        </p>
        <p className="mt-3 text-db-muted">
          Whatever we find — including nothing — we tell you straight, and there is always a next
          step.
        </p>
      </section>

      {/* Price */}
      <section className="rounded-xl border-2 border-db-accent bg-db-surface p-6">
        <p className="font-db-serif text-3xl font-bold">
          $299 <span className="text-base font-normal text-db-muted">· one price</span>
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>Up to 5,000 pages</li>
          <li>All five checks</li>
          <li>Human review of every report</li>
          <li>Both report parts, yours to keep</li>
          <li>Secure handling, deleted on request</li>
        </ul>
        <p className="mt-3 text-sm text-db-muted">
          More pages: $49 per additional 2,500 — we ask first, never surprise you. Re-run with new
          documents: $99. For comparison: an attorney review runs ~$3,000; medical second opinions
          $975–$2,000.
        </p>
        <p className="mt-3 text-sm text-db-muted">
          Refund policy: if we can&rsquo;t read your records, we tell you before we analyze — and
          you choose re-upload or refund.
        </p>
      </section>

      {/* Who this fits */}
      <section className="py-10">
        <h2 className="font-db-serif text-2xl font-semibold">This is not for every case</h2>
        <p className="mt-3">
          <strong>Fits:</strong> a Texas felony conviction, the appeal decided (or never filed),
          and a family ready to gather the documents.
        </p>
        <p className="mt-3">
          <strong>Not for:</strong> death-penalty cases (you have a right to appointed counsel),
          cases still on direct appeal (come back after it&rsquo;s decided), or out-of-state and
          federal convictions.
        </p>
      </section>

      {/* FAQ */}
      <section className="py-4">
        <h2 className="font-db-serif text-2xl font-semibold">Questions families ask</h2>
        <div className="mt-4 space-y-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="rounded-xl border border-db-line bg-db-surface p-4">
              <summary className="cursor-pointer font-semibold">{q}</summary>
              <p className="mt-2 text-db-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <div className="py-8 text-center">
        <CtaLink
          href="/check"
          position="footer"
          className="inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
        >
          {CTA}
        </CtaLink>
      </div>

      {/* Footer disclosures (landing spec §5) */}
      <footer className="border-t border-db-line pt-6 text-sm text-db-muted">
        <p>
          Family Case Review is a service of Snot Nose Legal. Snot Nose Legal is not a law firm and does not provide legal advice. Reports are
          information about court records, prepared with AI assistance and reviewed by trained
          staff, for use in consultation with a licensed attorney.
        </p>
        <p className="mt-3">
          <Link href="/auth/signin" className="underline">
            Staff sign in
          </Link>
        </p>
      </footer>
    </main>
  )
}
