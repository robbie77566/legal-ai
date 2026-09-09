'use client'

/**
 * Signed-in indicator (your_account spec U1/U2): the family's name is the
 * signal and the door. Signed out: "Sign in". Phone: the name links straight
 * to the account landing. Desktop: a chevron opens a small menu that names
 * each review. Reads SessionContext directly so pages without a provider
 * still render.
 */
import Link from 'next/link'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import * as NextAuth from 'next-auth/react'
import { apiFetch } from '@/lib/api'

// Pages render this nav with or without a SessionProvider (and tests mock
// next-auth/react partially), so resolve the context defensively: no
// provider or no export simply means "signed out".
const NoSession = createContext<NextAuth.SessionContextValue | undefined>(undefined)
function sessionContext(): React.Context<NextAuth.SessionContextValue | undefined> {
  try {
    return ((NextAuth as unknown as { SessionContext?: React.Context<NextAuth.SessionContextValue | undefined> }).SessionContext) ?? NoSession
  } catch {
    return NoSession
  }
}

export function firstName(name?: string | null, email?: string | null): string {
  const n = (name ?? '').trim()
  if (n) return n.split(/\s+/)[0]
  return (email ?? '').split('@')[0] || 'You'
}
export function initials(name?: string | null, email?: string | null): string {
  const n = (name ?? '').trim()
  if (n) return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return (email ?? '?')[0].toUpperCase()
}

export function NamePill({ name, email, compact, href = '/account' }: { name?: string | null; email?: string | null; compact?: boolean; href?: string }) {
  return (
    <Link
      href={href}
      data-testid="nav-name"
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-db-line bg-db-surface pl-1 pr-3 text-[15px] font-semibold text-db-ink"
    >
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-db-accent-soft text-sm font-bold text-db-accent">{initials(name, email)}</span>
      <span>{compact ? firstName(name, email) : (name?.trim() || firstName(name, email))}</span>
    </Link>
  )
}

export default function FamilyNav() {
  const session = useContext(sessionContext())
  const user = session?.data?.user as { name?: string | null; email?: string | null } | undefined
  const [open, setOpen] = useState(false)
  const [reviews, setReviews] = useState<Array<{ id: string; title: string }> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || reviews) return
    void apiFetch('/me').then(async (r) => { if (r.ok) { const d = await r.json(); setReviews((d.reviews ?? []).map((x: { id: string; title: string }) => ({ id: x.id, title: x.title }))) } }).catch(() => setReviews([]))
  }, [open, reviews])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <nav data-testid="family-nav" className="mx-auto flex max-w-xl items-center justify-between gap-3 px-5 py-4">
      <Link href="/" className="font-db-serif text-lg font-bold text-db-accent">Family Case Review</Link>
      {user ? (
        <div ref={ref} className="relative flex items-center gap-1">
          <span className="md:hidden"><NamePill name={user.name} email={user.email} compact /></span>
          <span className="hidden md:inline"><NamePill name={user.name} email={user.email} /></span>
          <button
            type="button"
            aria-label="Account menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="hidden min-h-11 min-w-11 items-center justify-center rounded-full text-db-muted md:inline-flex"
            data-testid="account-menu-button"
          >
            ▾
          </button>
          {open && (
            <div role="menu" data-testid="account-menu" className="absolute right-0 top-12 z-20 w-72 rounded-xl border border-db-line bg-db-surface p-1.5 text-[15px] shadow-lg">
              <div className="border-b border-db-line px-3 py-2">
                <div className="font-semibold">{user.name?.trim() || firstName(user.name, user.email)}</div>
                <div className="font-db-mono text-[13px] text-db-muted">{user.email}</div>
              </div>
              <Link role="menuitem" href="/account" className="block rounded-lg px-3 py-2 text-db-ink hover:bg-db-accent-soft">Your account</Link>
              {(reviews ?? []).map((r) => (
                <Link key={r.id} role="menuitem" href={`/case/${r.id}`} className="block rounded-lg px-3 py-2 text-db-ink hover:bg-db-accent-soft">{r.title}</Link>
              ))}
              <Link role="menuitem" href="/account#settings" className="block rounded-lg px-3 py-2 text-db-ink hover:bg-db-accent-soft">Account &amp; settings</Link>
              <button role="menuitem" onClick={() => void NextAuth.signOut({ callbackUrl: '/' })} className="mt-1 block w-full rounded-lg border-t border-db-line px-3 py-2 text-left text-db-muted hover:bg-db-accent-soft">Sign out</button>
            </div>
          )}
        </div>
      ) : (
        <Link href="/auth/signin" className="text-sm text-db-muted underline" data-testid="nav-signin">Sign in</Link>
      )}
    </nav>
  )
}
