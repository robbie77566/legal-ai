'use client'

import { useSession } from 'next-auth/react'

/** The signed-in staff member's system role, from the session JWT. */
export function useStaffRole(): string | undefined {
  const { data } = useSession()
  return (data?.user as { role?: string } | undefined)?.role
}
