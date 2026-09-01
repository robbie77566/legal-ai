import type { Metadata, Viewport } from 'next'
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import './daybreak.css'
import PaletteExperiment from '../../components/ab/PaletteExperiment'
import SiteFooter from '../../components/SiteFooter'

/**
 * Daybreak — the consumer surface (mvp_ui_design_spec.md). Light, warm, calm,
 * mobile-first. Nothing here is inherited from Industrial Authority except
 * brand DNA (gold accent, serif gravitas, semantic system).
 */
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-db-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-db-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-db-mono' })

export const metadata: Metadata = {
  title: 'Family Case Review',
  description:
    'Find out what is really in the Texas court record — before you spend thousands. World-class AI built for Texas post-conviction, every finding backed by an exact quote from the record. $299, one price. Information, not legal advice.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // safe-area insets for the sticky mobile CTA
}

export default function DaybreakLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} ${mono.variable}`}>
      <PaletteExperiment />
      {children}
      <SiteFooter />
    </div>
  )
}
