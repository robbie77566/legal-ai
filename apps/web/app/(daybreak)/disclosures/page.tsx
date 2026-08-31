/**
 * State disclosures (UPL posture, per state). DRAFT — each state section
 * requires sign-off by an attorney licensed in that state before that
 * state's launch (runbook launch gates). The purchase-flow acknowledgment
 * cards (packages/case-lifecycle/disclosures.ts) are a separately
 * versioned artifact: adding a state there bumps DISCLOSURE_SET_VERSION
 * under counsel review — this page informs, that gate binds.
 */
export default function Disclosures() {
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <p className="mb-4 rounded-xl border border-db-line p-3 text-sm text-db-muted">
        DRAFT — pending review by licensed counsel in each state listed.
      </p>
      <h1 className="font-db-serif text-3xl font-semibold">Disclosures</h1>
      <p className="mt-3">
        Plain answers to the questions that matter most before you pay us anything.
      </p>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">Who we are — and are not</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        <li>
          We are <strong>not a law firm</strong>, and no one here acts as your attorney. Family Case
          Review is an information service operated by Tangent Software LLC.
        </li>
        <li>
          Buying a review does <strong>not</strong> create an attorney-client relationship, and what
          you share with us is <strong>not protected by attorney-client privilege</strong>.
        </li>
        <li>
          Our report tells you <strong>what is in the court record</strong> — it is not legal advice,
          not a prediction of any outcome, and not a recommendation to file or not file anything.
        </li>
        <li>
          We do not prepare, complete, or file court documents, and we do not select legal forms for
          you or appear for you in any court or agency.
        </li>
        <li>
          Any dates or time limits in a report are <strong>estimates from the documents you
          provided</strong>. Only a licensed attorney can verify a deadline. Acting — or waiting —
          based on an estimate alone can permanently cost legal rights.
        </li>
        <li>
          Every report is meant to be <strong>taken to a licensed attorney</strong>. Sharing it with
          a lawyer or clinic does not, by itself, make them your lawyer.
        </li>
      </ul>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">Texas</h2>
      <p className="mt-2">
        We are not attorneys licensed in Texas, and we cannot represent you before any Texas court.
        Only a licensed Texas attorney may give legal advice about an appeal, a writ of habeas
        corpus, or any filing deadline. Texas law strictly limits second habeas applications — a
        first application filed without counsel can permanently forfeit claims, which is why our
        reports exist to be reviewed by an attorney, never to substitute for one. If you cannot
        afford an attorney, the State Bar of Texas Lawyer Referral Service (
        <a className="underline" href="https://www.texasbar.com" target="_blank" rel="noreferrer">
          texasbar.com
        </a>
        ) and Texas innocence organizations may be able to help.
      </p>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">Florida</h2>
      <p className="mt-2 text-sm text-db-muted">
        Service in Florida is not yet available. The disclosures below take effect when it opens.
      </p>
      <p className="mt-2">
        We are not attorneys licensed in Florida and may not give legal advice about Florida law,
        including motions under Rule 3.850 or their two-year time limit. We do not complete or
        select legal forms. Under the rules of the Florida Bar, a nonlawyer may provide only limited
        self-help assistance, and we do not provide services beyond information about the contents
        of your court record. For legal help, the Florida Bar Lawyer Referral Service can connect
        you with a licensed Florida attorney.
      </p>

      <h2 className="mt-8 font-db-serif text-xl font-semibold">California</h2>
      <p className="mt-2 text-sm text-db-muted">
        Service in California is not yet available. The disclosures below take effect when it opens.
      </p>
      <p className="mt-2">
        We are not attorneys licensed in California, and we are not a registered Legal Document
        Assistant under Business and Professions Code section 6400 et seq. — we do not prepare or
        process legal documents for filing. Only a licensed California attorney may advise you about
        a petition for writ of habeas corpus, resentencing eligibility, or any time limit. County
        bar association referral services and California innocence organizations can connect you
        with licensed counsel.
      </p>

      <p className="mt-8 text-sm text-db-muted">
        Questions about any of this: <a className="underline" href="mailto:admin@snotnoselegal.com">admin@snotnoselegal.com</a>.
        Before purchase, every customer separately reviews and acknowledges our core disclosures —
        that acknowledgment, not this page, is part of your agreement with us.
      </p>
    </main>
  )
}
