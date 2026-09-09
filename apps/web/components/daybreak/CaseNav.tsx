'use client'

/**
 * Case sub-navigation (customer_journey_ux_review G-C1): every case page is
 * one click from every other. Labels are the family's words, not statuses.
 */
import Link from 'next/link'
import FamilyNav from './FamilyNav'

export type CaseSection = 'overview' | 'documents' | 'progress' | 'report' | 'next-steps'

const ITEMS: Array<[CaseSection, string, (id: string) => string]> = [
  ['overview', 'Overview', (id) => `/case/${id}`],
  ['documents', 'Documents', (id) => `/case/${id}/documents`],
  ['progress', 'Progress', (id) => `/case/${id}/status`],
  ['report', 'Report', (id) => `/case/${id}/report`],
  ['next-steps', 'Next steps', (id) => `/case/${id}/next-steps`],
]

export default function CaseNav({ caseId, current }: { caseId: string; current: CaseSection }) {
  return (
    <>
    <div className="-mx-5 -mt-8 mb-4 border-b border-db-line"><FamilyNav /></div>
    <nav aria-label="Case sections" data-testid="case-nav" className="-mx-1 mb-5 flex flex-wrap gap-1 border-b border-db-line pb-2 text-sm">
      {ITEMS.map(([id, label, href]) => (
        <Link
          key={id}
          href={href(caseId)}
          aria-current={id === current ? 'page' : undefined}
          className={`rounded-full px-3 py-1.5 ${id === current ? 'bg-db-accent-soft font-semibold text-db-accent' : 'text-db-muted hover:text-db-ink'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
    </>
  )
}
