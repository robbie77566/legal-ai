/**
 * One Part B page, rendered as HTML, for /for-counsel §2 "The packet"
 * (professional_tier_expansion.md §6.2: lawyers buy on the artefact). Built
 * from the same fictional record the family sample report uses (the John
 * Fixture corpus, lib/content/sample-report.ts) so the two never disagree;
 * the shape mirrors packages/reports ReportFinding — partBText plus
 * citations of volume, page and excerpt, with the line added the way the
 * counsel packet prints it. Every name, number and quote is invented, and
 * the banner says so.
 */

export interface SampleCitation {
  volume: string
  page: number
  lines: string
  excerpt: string
}
export interface SampleFinding {
  id: string
  screen: string
  severity: 'Strong' | 'Review'
  preserved: 'Preserved' | 'Unpreserved' | 'Not applicable'
  harmStandard: string
  vehicle: string
  partBText: string
  citations: SampleCitation[]
}

export const SAMPLE_PART_B = {
  caption: 'Part B — sample page from a fictional record (State v. John Fixture). Every name, number and quote is invented.',
  matter: 'J.F. — Art. 11.07 application · Travis County · Cause No. D-1-DC-19-000000 (fictional)',
  verified: 'Verified against the record at render: 2 of 2 findings on this page hold; 0 dropped.',
  findings: [
    {
      id: 'F-07',
      screen: 'Ineffective assistance (failure to investigate)',
      severity: 'Strong',
      preserved: 'Not applicable',
      harmStandard: 'Strickland prejudice',
      vehicle: 'Art. 11.07',
      partBText:
        'Trial counsel conceded on the record that he made no attempt to contact the alibi witness the defendant had identified before trial. The State then argued in closing that no one had come to say the defendant was elsewhere. The deficiency and the prejudice argument both rest on pages the record itself supplies; an affidavit from the witness would close the gap on what she would have said.',
      citations: [
        { volume: 'RR vol. 4', page: 212, lines: '14–16', excerpt: 'Q: Did you ever attempt to contact Ms. Alvarez? A: I did not, no.' },
        { volume: 'RR vol. 2', page: 88, lines: '3–9', excerpt: 'He gave me her name and the number for the shop where she worked. That was before we picked the jury.' },
        { volume: 'RR vol. 5', page: 301, lines: '21–23', excerpt: 'Not one person came here to say he was elsewhere. Not one.' },
      ],
    },
    {
      id: 'F-11',
      screen: 'Brady',
      severity: 'Review',
      preserved: 'Not applicable',
      harmStandard: 'Materiality (Bagley)',
      vehicle: 'Art. 11.07',
      partBText:
        'The laboratory analyst testified that her bench notes were kept in the State\'s working file and were produced to no one. Materiality cannot be judged from this record alone; the notes are not in it. A records request for the complete laboratory case file is the next step before a Brady ground is pleaded.',
      citations: [
        { volume: 'RR vol. 3', page: 145, lines: '8–10', excerpt: 'We kept those in our working file. They weren\'t produced to anybody.' },
      ],
    },
  ] as SampleFinding[],
  dropped: 'Dropped at render: none on this page. A finding whose excerpt no longer matches the record text is listed here, never hidden.',
} as const

export default function SamplePartB() {
  return (
    <figure data-testid="sample-part-b" className="rounded-xl border border-db-line bg-db-surface shadow-sm">
      <figcaption className="border-b border-db-line px-5 py-3 text-sm font-semibold" style={{ color: 'var(--db-review)' }}>
        {SAMPLE_PART_B.caption}
      </figcaption>
      <div className="px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-db-line pb-3">
          <p className="font-db-serif text-lg font-semibold">Part B — Findings</p>
          <p className="font-db-mono text-xs text-db-muted">{SAMPLE_PART_B.matter}</p>
        </div>
        <p className="mt-3 text-xs text-db-muted">{SAMPLE_PART_B.verified}</p>
        <ol className="mt-4 space-y-5">
          {SAMPLE_PART_B.findings.map((f) => (
            <li key={f.id} className="rounded-lg border border-db-line p-4" data-testid={`sample-finding-${f.id}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-db-mono font-semibold">{f.id}</span>
                <span className="font-semibold">{f.screen}</span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: 'var(--db-accent-soft)', color: f.severity === 'Strong' ? 'var(--db-signal)' : 'var(--db-review)' }}
                >
                  {f.severity}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-db-muted sm:grid-cols-3">
                <div><dt className="inline font-semibold">Preservation: </dt><dd className="inline">{f.preserved}</dd></div>
                <div><dt className="inline font-semibold">Harm standard: </dt><dd className="inline">{f.harmStandard}</dd></div>
                <div><dt className="inline font-semibold">Vehicle: </dt><dd className="inline">{f.vehicle}</dd></div>
              </dl>
              <p className="mt-3 text-[15px]">{f.partBText}</p>
              <ul className="mt-3 space-y-2">
                {f.citations.map((c) => (
                  <li key={`${c.volume}-${c.page}-${c.lines}`} className="rounded-md bg-db-bg px-3 py-2 text-sm">
                    <span className="font-db-mono text-xs font-semibold text-db-ink">
                      {c.volume} · p. {c.page} · l. {c.lines}
                    </span>
                    <blockquote className="mt-1 border-l-2 border-db-line pl-3 italic text-db-muted">&ldquo;{c.excerpt}&rdquo;</blockquote>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-db-muted">{SAMPLE_PART_B.dropped}</p>
      </div>
    </figure>
  )
}
