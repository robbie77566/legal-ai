import { Source_Serif_4, Public_Sans } from 'next/font/google'
import Link from 'next/link'
import '../(daybreak)/daybreak.css'
import PaletteExperiment from '../../components/ab/PaletteExperiment'

/**
 * Auth pages wear the Daybreak consumer skin (was the legacy dark
 * "HabeasGraph" card — a cold brand break at the exact moment trust
 * matters most). Same tokens as the funnel, so the palette experiment
 * carries through sign-in; operators reach their dark consoles AFTER
 * the door, which stays customer-branded.
 */
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-db-serif' })
const sans = Public_Sans({ subsets: ['latin'], variable: '--font-db-sans' })

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`daybreak font-db-sans ${serif.variable} ${sans.variable} flex min-h-screen flex-col`}>
      <PaletteExperiment />
      <div className="flex flex-1 items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Link href="/" className="font-db-serif text-2xl font-bold text-db-accent">
              Family Case Review
            </Link>
          </div>
          <div className="rounded-xl border border-db-line bg-db-surface p-8">{children}</div>
          <p className="mt-6 text-center text-xs leading-relaxed text-db-muted">
            A service of Snot Nose Legal, operated by Tangent Software LLC. Not a law firm — we
            provide information about court records, not legal advice.
          </p>
        </div>
      </div>
    </div>
  )
}
