'use client'

/**
 * Backup email confirm (your_account "Backup email (2026-10-24)"): the link
 * from the confirmation email lands here, signed in or not. The token alone
 * proves the address; the api verifies it (POST /me/backup-email/confirm).
 * Shared by staff (ops /profile) and families (/account); copy in {en, es}.
 */
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { tpl, useContent } from '@/lib/i18n'
import { BACKUP_EMAIL_CONTENT } from '@/lib/content/backup-email'

function Confirm() {
  const t = useContent(BACKUP_EMAIL_CONTENT).confirm
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'busy' | 'done' | 'error'>(token ? 'busy' : 'error')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    void apiFetch('/me/backup-email/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) { setEmail(String(d.backupEmail ?? '')); setState('done') }
        else { setError(typeof d.error === 'string' ? d.error : ''); setState('error') }
      })
      .catch(() => { setError(''); setState('error') })
  }, [token])

  if (state === 'busy') return <p className="text-sm text-db-muted">{t.busy}</p>
  if (state === 'done') {
    return (
      <div data-testid="backup-confirm-done">
        <h1 className="text-xl font-semibold">{t.doneTitle}</h1>
        <p className="mt-3 text-sm text-db-muted">{tpl(t.doneBody, { email })}</p>
        <Link href="/auth/signin" className="mt-6 inline-block text-sm text-db-accent underline">{t.signIn}</Link>
      </div>
    )
  }
  return (
    <div data-testid="backup-confirm-error">
      <h1 className="text-xl font-semibold">{t.failTitle}</h1>
      <p role="alert" className="mt-3 text-sm text-db-muted">{!token ? t.incomplete : error || t.failBody}</p>
      <Link href="/auth/signin" className="mt-6 inline-block text-sm text-db-accent underline">{t.signIn}</Link>
    </div>
  )
}

export default function BackupEmailConfirm() {
  return (
    <Suspense>
      <Confirm />
    </Suspense>
  )
}
