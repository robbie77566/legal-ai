/**
 * Privacy policy (M7 / TDPSA / NFR-3). DRAFT — requires counsel review
 * before launch (ENG-11 gate); the retention matrix mirrors
 * mvp_v1_system_design.md §11a.2 exactly and must stay in sync with it.
 */
export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <p className="mb-4 rounded-xl border border-db-line p-3 text-sm text-db-muted">
        DRAFT — pending attorney review. Not yet effective.
      </p>
      <h1 className="font-db-serif text-3xl font-semibold">Privacy policy</h1>
      <p className="mt-3">
        Family Case Review, a service of Snot Nose Legal and operated by Tangent Software LLC (&ldquo;we&rdquo;), analyzes criminal court
        records you choose to upload. This page says plainly what we keep, for how long, and what
        happens when you ask us to delete.
      </p>

      <h2 className="mt-6 font-db-serif text-xl font-semibold">What we collect</h2>
      <p className="mt-2">
        Your account details (name, email), payment records (processed by Stripe — we never see full
        card numbers), the court documents you upload, and the analysis we produce from them. We do
        not buy data about you, and we do not sell or share your data for advertising.
      </p>

      <h2 className="mt-6 font-db-serif text-xl font-semibold">How your documents are used</h2>
      <p className="mt-2">
        Documents are used only to produce your case review. Our AI providers process them under
        zero-retention controls — your family&rsquo;s records are never used to train anyone&rsquo;s
        models.
      </p>

      <h2 className="mt-6 font-db-serif text-xl font-semibold">How long we keep things</h2>
      <p className="mt-2">
        Case content is kept for 12 months after your report, then deleted. If you ask us to delete
        sooner, we do. Deletion is real but scoped — here is exactly what is removed and what
        survives, and why:
      </p>
      <ul className="mt-2 list-disc pl-5 space-y-1 text-sm">
        <li>
          <strong>Deleted:</strong> your uploaded documents, every extracted page and passage, the
          analysis findings, and your report — including copies in backups within 35 days.
        </li>
        <li>
          <strong>Kept — payment ledger (7 years):</strong> required for tax and financial records.
          It shows what was paid, not what was in your documents.
        </li>
        <li>
          <strong>Kept — disclosure acknowledgments (24 months):</strong> the record that the
          service&rsquo;s limits were shown and accepted, kept for dispute defense.
        </li>
        <li>
          <strong>Kept — a pseudonymized activity skeleton:</strong> dates and stage changes with no
          names and no document content, so our books balance and audits work.
        </li>
      </ul>

      <h2 className="mt-6 font-db-serif text-xl font-semibold">Who touches your data</h2>
      <p className="mt-2 text-sm">
        Subprocessors: Amazon Web Services (storage, document text extraction), Anthropic (AI
        analysis, zero-retention), Stripe (payments), Resend (email). Each processes only what its
        job requires.
      </p>

      <h2 className="mt-6 font-db-serif text-xl font-semibold">Your rights (Texas TDPSA)</h2>
      <p className="mt-2 text-sm">
        You can ask what we hold about you, correct it, delete it (scoped as above), or get a copy.
        Email support and we respond within the statutory window. We do not sell personal data and
        do not process it for targeted advertising, so there is nothing to opt out of.
      </p>

      <p className="mt-6 text-xs text-db-muted">
        Questions: reply to any of our emails. This policy will carry an effective date when counsel
        review completes.
      </p>
    </main>
  )
}
