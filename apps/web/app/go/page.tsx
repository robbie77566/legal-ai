'use client'

/** Role-aware sign-in landing (US-11): a family must never land on a
 *  professional surface, and an attorney customer never on the QA console.
 *  The decision is lib/landing.ts (unit-tested); this page only applies it. */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { landingFor } from '@/lib/landing'

export default function Go() {
  const router = useRouter()
  const { data: session, status } = useSession()
  useEffect(() => {
    if (status === 'loading') return
    const user = session?.user as { role?: string; accountKind?: string } | undefined
    router.replace(landingFor({ role: user?.role, accountKind: user?.accountKind }))
  }, [status, session, router])
  return null
}
