import type { Metadata, Viewport } from 'next'
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono, Permanent_Marker } from 'next/font/google'
import { BRAND } from '@hg/case-lifecycle'
import '../(daybreak)/daybreak.css'
import ProfessionalSiteNav from '../../components/professional/ProfessionalSiteNav'
import ProfessionalFooter from '../../components/professional/ProfessionalFooter'

/**
 * The professional marketing site (persona_rollout_plan.md §5 F; GTM rule:
 * audiences never see each other's copy). Same Daybreak tokens as the family
 * site, a different tone — plain, specific, no urgency theatre — and its own
 * chrome: this nav and footer never link to the family pages, and the family
 * nav never links here (one text link in the family footer is the only
 * crossing). Public and indexable in production; the root layout adds the
 * staging noindex. No palette experiment, no language switch.
 */
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-db-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-db-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-db-mono' })
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-db-marker' })

export const metadata: Metadata = {
  title: `For counsel — ${BRAND.name}`,
  description:
    'Counsel Review: every preserved objection, IAC, Brady, 11.073 and sentencing finding in a Texas trial record, cited to volume, page and line. Priced by record length. Prepared at counsel\'s direction for counsel\'s use.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function ProfessionalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} ${mono.variable} ${marker.variable}`}>
      <ProfessionalSiteNav />
      {children}
      <ProfessionalFooter />
    </div>
  )
}
