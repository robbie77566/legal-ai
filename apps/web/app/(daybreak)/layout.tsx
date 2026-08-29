import type { Metadata } from 'next'
import { Source_Serif_4, Public_Sans, IBM_Plex_Mono } from 'next/font/google'
import './daybreak.css'

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
    'Find out what is really in the Texas court record — before you spend thousands. $299, one price, reviewed by a trained legal reviewer. Information, not legal advice.',
}

export default function DaybreakLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} ${mono.variable}`}>
      {children}
    </div>
  )
}
