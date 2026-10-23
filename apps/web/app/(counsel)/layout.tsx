import type { Metadata } from 'next'
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import { BRAND } from '@hg/case-lifecycle'
import '../(daybreak)/daybreak.css'
import { CounselProvider } from '../../components/counsel/CounselContext'
import ProfessionalNav from '../../components/counsel/ProfessionalNav'
import CounselGate from '../../components/counsel/CounselGate'
import NotASubstitute from '../../components/NotASubstitute'

/**
 * The professional app's shell (persona_rollout_plan.md §5 F): the Daybreak
 * tokens, the ProfessionalNav, and the flag gate around every page. Not the
 * family skin, not the ops console. The middleware already requires a
 * PROFESSIONAL account on every path here except /counsel/join, which lives
 * in the public (professional) group. Never indexed.
 */
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-db-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-db-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-db-mono' })

export const metadata: Metadata = {
  title: `Counsel — ${BRAND.name}`,
  robots: { index: false, follow: false },
}

export default function CounselLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} ${mono.variable} min-h-screen`}>
      <CounselProvider>
        <ProfessionalNav />
        <main className="mx-auto w-full max-w-5xl px-5 py-8">
          <CounselGate>{children}</CounselGate>
          {/* UPL review 2026-10-23 (P7, rec 1): the statement on every professional page too. */}
          <NotASubstitute className="mt-12 border-t border-db-line pt-6 text-sm text-db-muted" />
        </main>
      </CounselProvider>
    </div>
  )
}
