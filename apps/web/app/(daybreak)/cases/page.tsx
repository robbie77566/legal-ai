'use client'

/** "Your reviews" became the account landing (your_account spec §8). Old links keep working. */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function YourReviews() {
  const router = useRouter()
  useEffect(() => { router.replace('/account') }, [router])
  return <main className="mx-auto max-w-xl px-5 py-12 text-db-muted">Taking you to your account…</main>
}
