'use client'

/** Role-aware sign-in landing (US-11): a family must never land on a
 *  professional surface. CLIENT → /cases, ATTORNEY → /qa, ADMIN → /ops. */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'

export default function Go() {
  const router = useRouter()
  const { data: session, status } = useSession()
  useEffect(() => {
    if (status === 'loading') return
    const role = (session?.user as { role?: string } | undefined)?.role
    router.replace(role === 'ATTORNEY' ? '/qa' : role === 'ADMIN' ? '/ops' : '/cases')
  }, [status, session, router])
  return null
}
