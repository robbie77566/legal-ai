'use client'

/**
 * "Already have an account? Sign in" — under the hero button on both landing
 * pages. The nav's small grey Sign in link was easy to lose on a phone and
 * vanished once signed in, so a returning family saw no way in (2026-09-09).
 * Signed in, it becomes the way back to their reviews instead.
 */
import Link from 'next/link'
import { useContext } from 'react'
import { SessionContext } from 'next-auth/react'
import { useContent } from '../../lib/i18n'

const T = {
  en: { have: 'Already have an account?', signIn: 'Sign in', back: 'You’re signed in —', reviews: 'go to your reviews' },
  es: { have: '¿Ya tiene una cuenta?', signIn: 'Iniciar sesión', back: 'Ya inició sesión —', reviews: 'ir a sus revisiones' },
}

export default function ReturningLine({ className = '' }: { className?: string }) {
  const t = useContent(T)
  const session = useContext(SessionContext)
  const signedIn = !!session?.data?.user
  return (
    <p className={`text-sm text-db-muted ${className}`} data-testid="hero-returning">
      {signedIn ? (
        <>
          {t.back}{' '}
          <Link href="/cases" className="font-semibold text-db-accent underline" data-testid="hero-reviews">
            {t.reviews}
          </Link>
        </>
      ) : (
        <>
          {t.have}{' '}
          <Link href="/auth/signin" className="font-semibold text-db-accent underline" data-testid="hero-signin">
            {t.signIn}
          </Link>
        </>
      )}
    </p>
  )
}
