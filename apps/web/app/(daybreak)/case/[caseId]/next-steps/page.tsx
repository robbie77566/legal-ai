'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/**
 * S7 next steps (UI spec §5.8): consent card (default OFF, names who and
 * exactly what, revocable), the share-with-a-lawyer link, and the State Bar
 * LRIS — the R-6-compliant referral surface (no matching, no fees).
 */

interface Grant {
  id: string
  recipientClass: string
  revokedAt: string | null
}

export default function NextSteps() {
  const { caseId } = useParams<{ caseId: string }>()
  const [grants, setGrants] = useState<Grant[]>([])
  const [shareUrl, setShareUrl] = useState('')
  const [opens, setOpens] = useState<number | null>(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    const res = await apiFetch(`/cases/${caseId}/consent`)
    if (res.ok) setGrants((await res.json()).grants)
    const act = await apiFetch(`/cases/${caseId}/share-link/activity`)
    if (act.ok) {
      const { links } = await act.json()
      const active = links.find((l: { revokedAt: string | null }) => !l.revokedAt)
      setOpens(active ? active.opens : null)
    }
  }, [caseId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const clinicOn = grants.some((g) => g.recipientClass === 'clinic' && !g.revokedAt)

  const toggleClinic = async () => {
    setNotice('')
    const res = await apiFetch(
      `/cases/${caseId}/consent${clinicOn ? '/revoke' : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientClass: 'clinic' }),
      }
    )
    if (!res.ok) setNotice('Consent options open once your report is ready.')
    await refresh()
  }

  const makeShareLink = async () => {
    setNotice('')
    const res = await apiFetch(`/cases/${caseId}/share-link`, { method: 'POST' })
    if (res.ok) {
      const { token } = await res.json()
      setShareUrl(`${window.location.origin}/shared/${token}`)
    } else {
      setNotice('Sharing opens once your report is ready.')
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">What happens next is your choice</h1>
      {notice && <p className="mt-3 text-sm text-db-muted">{notice}</p>}

      {/* Share with a lawyer (ENG-8) */}
      <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-lg font-semibold">Share the packet with a lawyer</h2>
        <p className="mt-2 text-sm text-db-muted">
          Creates a private link to the attorney packet (Part B). It expires in 30 days, you can
          turn it off any time, and we&rsquo;ll show you when it&rsquo;s been opened.
        </p>
        {shareUrl ? (
          <p className="mt-3 break-all rounded-lg bg-db-accent-soft p-3 font-db-mono text-sm">{shareUrl}</p>
        ) : (
          <button
            onClick={makeShareLink}
            className="mt-3 rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
          >
            Create a share link
          </button>
        )}
        {opens !== null && (
          <p className="mt-2 text-sm" style={{ color: 'var(--db-signal)' }}>
            Opened {opens} time{opens === 1 ? '' : 's'} so far.
          </p>
        )}
        <p className="mt-2 text-xs text-db-muted">
          Sharing does not by itself create an attorney-client relationship or privilege.
        </p>
      </section>

      {/* Consent (US-5): default OFF, explicit, revocable */}
      <section className="mt-4 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-lg font-semibold">Share with an innocence clinic</h2>
        <p className="mt-2 text-sm text-db-muted">
          Only if you say so: we&rsquo;d share the attorney packet (Part B) and basic case details
          with an innocence clinic — nothing else, to no one else. Off by default; you can change
          your mind any time.
        </p>
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" checked={clinicOn} onChange={toggleClinic} className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {clinicOn ? 'Consent is ON — sharing allowed' : 'Consent is OFF — nothing is shared'}
          </span>
        </label>
      </section>

      {/* Directory (R-6-compliant) */}
      <section className="mt-4 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-lg font-semibold">Find a lawyer</h2>
        <p className="mt-2 text-sm text-db-muted">
          The State Bar of Texas runs a certified Lawyer Referral &amp; Information Service — a
          neutral way to find licensed counsel. We receive nothing from any referral.
        </p>
        <a
          href="https://www.texasbar.com/lris"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-lg border border-db-accent px-4 py-2 text-sm font-semibold text-db-accent"
        >
          State Bar Lawyer Referral Service
        </a>
      </section>
    </main>
  )
}
