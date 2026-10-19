import type { Metadata } from 'next'
import Link from 'next/link'
import { BRAND } from '@hg/case-lifecycle'
import { SECURITY_PAGE as S } from '../../../../lib/content/professional'

/**
 * /for-offices/security — docs/security/security_one_pager.md rendered for a
 * chief defender's procurement file. The founder's bracketed review items are
 * not on the page; anything a prospect asks that is not here goes to the
 * security contact, not to a guess.
 */
export const metadata: Metadata = {
  title: `${S.title} — ${BRAND.name}`,
  description: 'Hosting, encryption, isolation between organisations, retention, sub-processors and incident response, as built.',
}

export default function SecurityOnePager() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-12 pt-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-db-muted">
        <Link href="/for-offices" className="underline">For offices</Link> · Security
      </p>
      <h1 className="mt-2 font-db-serif text-4xl font-bold">{S.title}</h1>
      <p className="mt-3 text-lg text-db-muted">{S.lead}</p>
      {S.sections.map((sec) => (
        <section key={sec.heading} aria-labelledby={`sec-${sec.heading.replace(/\W+/g, '-').toLowerCase()}`} className="mt-10">
          <h2 id={`sec-${sec.heading.replace(/\W+/g, '-').toLowerCase()}`} className="font-db-serif text-2xl font-semibold">{sec.heading}</h2>
          {'paras' in sec && !('table' in sec) && sec.paras.map((p) => <p key={p} className="mt-3 text-[15px]">{p}</p>)}
          {'items' in sec && (
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px]">
              {sec.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
          )}
          {'table' in sec && (
            <>
              <table className="mt-3 w-full border-collapse text-[15px]">
                <tbody>
                  {sec.table.map(([a, b]) => (
                    <tr key={a} className="border-t border-db-line">
                      <th scope="row" className="py-2 pr-4 text-left align-top font-semibold">{a}</th>
                      <td className="py-2 align-top text-db-muted">{b}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sec.paras?.map((p) => <p key={p} className="mt-3 text-[15px]">{p}</p>)}
            </>
          )}
        </section>
      ))}
      <p className="mt-10 border-t border-db-line pt-4 text-sm text-db-muted">
        Not a law firm; not legal advice. This page describes controls as built; the data-processing agreement governs. Security contact: <a href={`mailto:${BRAND.email}`} className="underline">{BRAND.email}</a>.
      </p>
    </main>
  )
}
