import { Source_Serif_4, Public_Sans, Permanent_Marker } from 'next/font/google'
import '../(daybreak)/daybreak.css'
import PaletteExperiment from '../../components/ab/PaletteExperiment'
import { LangProvider, LangSwitch } from '../../lib/i18n'
import BrandLogo from '../../components/daybreak/BrandLogo'

/**
 * Auth pages wear the Daybreak consumer skin (was the legacy dark
 * "HabeasGraph" card — a cold brand break at the exact moment trust
 * matters most). Same tokens as the funnel, so the palette experiment
 * carries through sign-in; operators reach their dark consoles AFTER
 * the door, which stays customer-branded.
 */
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-db-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-db-sans' })
const marker = Permanent_Marker({ subsets: ['latin'], weight: '400', variable: '--font-db-marker' })

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} ${marker.variable} flex min-h-screen flex-col`}>
      <LangProvider>
      <PaletteExperiment />
      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-md">
          {/* i18n R2: the selector is clearly visible on the sign-in/up page */}
          <div className="mb-3 flex justify-end">
            <LangSwitch />
          </div>
          <div className="mb-8 text-center">
            <BrandLogo size="auth" tagline />
          </div>
          <div className="rounded-xl border border-db-line bg-db-surface p-8">{children}</div>
          <p className="mt-6 text-center text-xs leading-relaxed text-db-muted">
            Operated by Tangent Solutions LLC. Not a law firm — we provide information about court
            records, not legal advice.
          </p>
        </div>
      </div>
      </LangProvider>
    </div>
  )
}
