'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import CaseNav from '../../../../../components/daybreak/CaseNav'
import NotASubstitute from '../../../../../components/NotASubstitute'
import { LRIS_URL, NO_REFERRAL_FEE } from '@hg/case-lifecycle'

/**
 * S7 next steps (UI spec §5.8): consent card (default OFF, names who and
 * exactly what, revocable), the share-with-a-lawyer link, and the State Bar
 * LRIS — the R-6-compliant referral surface (no matching, no fees).
 */

interface Grant {
  id: string
  recipientClass: string
  recipientOrganisationId?: string | null
  revokedAt: string | null
}

/** A clinic that can receive the packet in its inbox (workstream I; share_link_ux.md "Delivering the packet to a clinic"). */
interface Clinic {
  id: string
  name: string
}

export default function NextSteps() {
  const { caseId } = useParams<{ caseId: string }>()
  const [grants, setGrants] = useState<Grant[]>([])
  const [shareUrl, setShareUrl] = useState('')
  const [shareExpires, setShareExpires] = useState<string | null>(null)
  const [opens, setOpens] = useState<number | null>(null)
  // An active link created on an earlier visit: the raw token is never stored,
  // so it cannot be shown again — only its status; a new one can be made.
  const [activeLink, setActiveLink] = useState<{ createdAt: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  useEffect(() => { setCanShare(typeof navigator !== 'undefined' && typeof (navigator as Navigator & { share?: unknown }).share === 'function') }, [])
  const [notice, setNotice] = useState('')
  // The clinic picker: the clinics whose inbox is live (empty until one is),
  // the one the family chose, and what happened when they sent the packet.
  const [clinics, setClinics] = useState<Clinic[]>([])
  const [clinicId, setClinicId] = useState('')
  const [packetNotice, setPacketNotice] = useState('')

  const refresh = useCallback(async () => {
    const res = await apiFetch(`/cases/${caseId}/consent`)
    if (res.ok) setGrants((await res.json()).grants)
    const cl = await apiFetch(`/cases/${caseId}/packets/clinics`)
    if (cl.ok) {
      const body = (await cl.json()) as { clinics?: Clinic[] }
      setClinics(Array.isArray(body.clinics) ? body.clinics : [])
    }
    const act = await apiFetch(`/cases/${caseId}/share-link/activity`)
    if (act.ok) {
      const { links } = await act.json()
      const active = links.find((l: { revokedAt: string | null }) => !l.revokedAt)
      setOpens(active ? active.opens : null)
      setActiveLink(active ? { createdAt: active.createdAt, expiresAt: active.expiresAt } : null)
    }
  }, [caseId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const activeClinicGrant = grants.find((g) => g.recipientClass === 'clinic' && !g.revokedAt)
  const clinicOn = !!activeClinicGrant
  const namedClinic = activeClinicGrant?.recipientOrganisationId
    ? clinics.find((c) => c.id === activeClinicGrant.recipientOrganisationId) ?? null
    : null

  const toggleClinic = async () => {
    setNotice('')
    setPacketNotice('')
    const res = await apiFetch(
      `/cases/${caseId}/consent${clinicOn ? '/revoke' : ''}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Naming a clinic limits the consent to that clinic; "any clinic" keeps the original shape.
        body: JSON.stringify(clinicOn || !clinicId ? { recipientClass: 'clinic' } : { recipientClass: 'clinic', recipientOrganisationId: clinicId }),
      }
    )
    if (!res.ok) setNotice('Consent options open once your report is ready.')
    await refresh()
  }

  // Delivers the released packet to the named clinic's inbox — nothing is
  // uploaded or copied; the clinic reads the same report, and turning the
  // consent off closes it again.
  const sendPacket = async () => {
    if (!namedClinic) return
    setPacketNotice('')
    const res = await apiFetch(`/cases/${caseId}/packets/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicOrganisationId: namedClinic.id }),
    })
    if (res.ok) {
      const { alreadyDelivered } = (await res.json()) as { alreadyDelivered?: boolean }
      setPacketNotice(
        alreadyDelivered
          ? `${namedClinic.name} already has this packet in its inbox.`
          : `Sent. ${namedClinic.name} will find the packet in its inbox; we'll show you here when it's been opened. Turn consent off any time to close it.`
      )
    } else {
      setPacketNotice('We could not send the packet just now. Check that your report is ready and consent is on.')
    }
  }

  const makeShareLink = async () => {
    setNotice('')
    setCopied(false)
    // One live link at a time: a new one replaces the old (2026-09-13).
    if (activeLink) await apiFetch(`/cases/${caseId}/share-link/revoke`, { method: 'POST' })
    const res = await apiFetch(`/cases/${caseId}/share-link`, { method: 'POST' })
    if (res.ok) {
      const { token, expiresAt } = await res.json()
      setShareUrl(`${window.location.origin}/shared/${token}`)
      setShareExpires(expiresAt ?? null)
      await refresh()
    } else {
      setNotice('Sharing opens once your report is ready.')
    }
  }

  // The link can actually leave the page (2026-09-13: it could only be read):
  // copy, email, the phone's share sheet — and turn it off.
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setNotice('Copy didn’t work here — press and hold the link to select it, then copy.')
    }
  }
  const shareNative = async () => {
    try {
      await (navigator as Navigator & { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({
        title: 'Attorney packet — Snot Nose Legal',
        text: 'A private link to the attorney packet for our case review. It expires in 30 days.',
        url: shareUrl,
      })
    } catch {
      /* the person closed the sheet */
    }
  }
  const revokeLink = async () => {
    setNotice('')
    const res = await apiFetch(`/cases/${caseId}/share-link/revoke`, { method: 'POST' })
    if (res.ok) {
      setShareUrl('')
      setShareExpires(null)
      setNotice('The link is off. Anyone who has it will see that it is no longer available.')
      await refresh()
    }
  }
  const expiresText = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null)
  const mailto = `mailto:?subject=${encodeURIComponent('Attorney packet for our case review')}&body=${encodeURIComponent(`Here is a private link to the attorney packet (Part B) from our Snot Nose Legal case review:\n\n${shareUrl}\n\nIt expires ${expiresText(shareExpires) ?? 'in 30 days'} and we can turn it off at any time. Opening it does not by itself create an attorney-client relationship.`)}`

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <CaseNav caseId={caseId} current="next-steps" />
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
          <div className="mt-3" data-testid="share-ready">
            <p className="break-all rounded-lg bg-db-accent-soft p-3 font-db-mono text-sm" data-testid="share-url">{shareUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void copyLink()} className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface" data-testid="share-copy">
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
              <a href={mailto} className="rounded-lg border border-db-line px-4 py-2 text-sm font-semibold" data-testid="share-email">
                Send by email
              </a>
              {canShare && (
                <button onClick={() => void shareNative()} className="rounded-lg border border-db-line px-4 py-2 text-sm font-semibold" data-testid="share-native">
                  Share…
                </button>
              )}
            </div>
            <p className="mt-2 text-sm text-db-muted">
              {shareExpires ? `Works until ${expiresText(shareExpires)}. ` : ''}Copy it now — for your safety we don&rsquo;t keep a copy to show you later; you can always create a new one.
            </p>
          </div>
        ) : activeLink ? (
          <div className="mt-3" data-testid="share-active">
            <p className="text-sm">
              A link is active (created {new Date(activeLink.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}, works until {expiresText(activeLink.expiresAt)}). We don&rsquo;t keep a copy to show again.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={makeShareLink} className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface" data-testid="share-create">
                Create a new link
              </button>
              <button onClick={() => void revokeLink()} className="rounded-lg border border-db-line px-4 py-2 text-sm" data-testid="share-revoke">
                Turn the link off
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={makeShareLink}
            className="mt-3 rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
            data-testid="share-create"
          >
            Create a share link
          </button>
        )}
        {shareUrl && (
          <button onClick={() => void revokeLink()} className="mt-2 text-sm text-db-muted underline" data-testid="share-revoke">
            Turn the link off
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
          Only if you say so: we&rsquo;d share the attorney packet (Part B) and the case reference
          with an innocence clinic — nothing else, to no one else. Off by default; you can change
          your mind any time.
        </p>
        {clinics.length > 0 && !clinicOn && (
          <label className="mt-3 block text-sm">
            <span className="font-semibold">Which clinic?</span>
            <select
              value={clinicId}
              onChange={(e) => setClinicId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-db-line bg-db-surface px-3 py-2"
              data-testid="clinic-picker"
            >
              <option value="">Any innocence clinic</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" checked={clinicOn} onChange={toggleClinic} className="h-5 w-5" />
          <span className="text-sm font-semibold">
            {clinicOn
              ? namedClinic
                ? `Consent is ON — sharing allowed with ${namedClinic.name}`
                : 'Consent is ON — sharing allowed'
              : 'Consent is OFF — nothing is shared'}
          </span>
        </label>
        {clinicOn && namedClinic && (
          <div className="mt-3" data-testid="packet-send">
            <button
              onClick={() => void sendPacket()}
              className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
              data-testid="packet-deliver"
            >
              Send the packet to {namedClinic.name}
            </button>
            <p className="mt-2 text-xs text-db-muted">
              The clinic reads the attorney packet (Part B) and the case reference from its own inbox — nothing else. You never upload it again, and turning consent off closes it.
            </p>
          </div>
        )}
        {packetNotice && <p className="mt-2 text-sm" data-testid="packet-notice">{packetNotice}</p>}
        {/* R-7 on the clinic card too (UPL review 2026-10-23, F7). */}
        <p className="mt-2 text-xs text-db-muted" data-testid="clinic-r7">
          Sharing does not by itself create an attorney-client relationship or privilege.
        </p>
      </section>

      {/* Directory (R-6-compliant) */}
      <section className="mt-4 rounded-xl border border-db-line bg-db-surface p-5">
        <h2 className="font-db-serif text-lg font-semibold">Find a lawyer</h2>
        <p className="mt-2 text-sm text-db-muted">
          The State Bar of Texas runs a certified Lawyer Referral &amp; Information Service — a
          neutral way to find licensed counsel. {NO_REFERRAL_FEE.en}
        </p>
        <a
          href={LRIS_URL}
          data-testid="lris-link"
          rel="noopener noreferrer"
          className="mt-3 inline-block rounded-lg border border-db-accent px-4 py-2 text-sm font-semibold text-db-accent"
        >
          State Bar Lawyer Referral Service
        </a>
      </section>
      <NotASubstitute className="mt-6 text-db-muted" />
    </main>
  )
}
