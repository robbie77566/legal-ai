'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'

/**
 * S2/S3 checklist home (UI spec §5.4–5.5): per-item upload embedded in the
 * checklist, the shoebox path first-class, and the explicit celebrated
 * "records complete" moment that starts the clock.
 */

interface ChecklistItem {
  id: string
  kind: string
  label: string
  state: 'NEEDED' | 'UPLOADED' | 'CONFIRMED' | 'PROBLEM'
}
interface CaseDocument {
  id: string
  filename: string
  suggestedChecklistItemId: string | null
  classificationConfirmed: boolean
  quarantined: boolean
}
interface ChecklistData {
  status: string
  items: ChecklistItem[]
  documents: CaseDocument[]
  slaStartedAt: string | null
}
interface Meter {
  billable: number
  duplicatesIgnored: number
  cap: number
}

const HOWTO: Record<string, string> = {
  judgment: 'The district clerk of the county of conviction has this — ask for a certified copy (often ~$1/page).',
  indictment: "Also at the district clerk's office, in the case file.",
  clerks_record: 'Ask the district clerk for the case file. For 2016-or-later e-filings, re:SearchTX may have it online.',
  rr_volume:
    'If there was a direct appeal, the trial transcript usually already exists — ask the district clerk or the court of appeals before paying a court reporter for a new one.',
  appellate_opinion: 'Search the court of appeals website by case number, or ask the clerk.',
  plea_papers: "The plea paperwork is in the district clerk's case file.",
  admonishments: "Part of the plea paperwork at the district clerk's office.",
  judicial_confession: "Part of the plea paperwork at the district clerk's office.",
  plea_agreement: "Ask the district clerk for the full plea file.",
  prior_writ_application: 'The district clerk keeps writ filings under the same cause number (often with a -A suffix).',
  prior_writ_answer: "Ask the district clerk for the State's answer in the writ file.",
  prior_writ_findings: "Ask the district clerk for the court's findings in the writ file.",
}

export default function CaseDocuments() {
  const { caseId } = useParams<{ caseId: string }>()
  const router = useRouter()
  const [data, setData] = useState<ChecklistData | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [celebrate, setCelebrate] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingItem = useRef<string | null>(null)

  const [meter, setMeter] = useState<Meter | null>(null)
  const [correcting, setCorrecting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const res = await apiFetch(`/cases/${caseId}/checklist`)
    if (res.ok) setData(await res.json())
    const m = await apiFetch(`/cases/${caseId}/pages`)
    if (m.ok) setMeter(await m.json())
  }, [caseId])

  const verdict = async (docId: string, action: 'confirm' | 'correct', checklistItemId?: string) => {
    await apiFetch(`/cases/${caseId}/documents/${docId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(checklistItemId ? { body: JSON.stringify({ checklistItemId }) } : {}),
    })
    setCorrecting(null)
    await refresh()
  }

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pickFile = (itemLabel: string | null) => {
    pendingItem.current = itemLabel
    fileInput.current?.click()
  }

  const upload = async (file: File) => {
    setError('')
    setUploading(pendingItem.current ?? 'shoebox')
    try {
      const presign = await apiFetch('/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, caseId }),
      })
      if (!presign.ok) throw new Error('Could not start the upload — please try again.')
      const { url, s3Key } = await presign.json()

      try {
        await fetch(url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        })
      } catch {
        /* local dev without S3: registration still records the document */
      }

      const complete = await apiFetch('/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, filename: file.name, s3Key }),
      })
      if (!complete.ok) throw new Error('The upload didn’t finish — please try again.')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — please try again.')
    } finally {
      setUploading(null)
      pendingItem.current = null
    }
  }

  const [readyBy, setReadyBy] = useState('')
  const markComplete = async () => {
    setError('')
    const res = await apiFetch(`/cases/${caseId}/records-complete`, { method: 'POST' })
    if (res.ok) {
      const body = await res.json()
      if (body.expectedReadyAt) setReadyBy(String(body.expectedReadyAt).slice(0, 10))
      setCelebrate(true)
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Could not mark records complete yet.')
    }
  }

  if (celebrate) {
    return (
      <main className="mx-auto max-w-xl px-5 py-12">
        <div className="rounded-xl border-2 border-db-accent bg-db-accent-soft p-8 text-center">
          <h1 className="font-db-serif text-3xl font-semibold">
            Your documents are complete. Your review has started.
          </h1>
          <p className="mt-4 text-db-muted">
            The clock starts now{readyBy ? ` — expect your report by ${readyBy}` : ''}. We&rsquo;ll email you at every step, and you can watch progress any time.
          </p>
          <Link
            href={`/case/${caseId}/status`}
            className="mt-6 inline-block rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface"
          >
            Watch your review&rsquo;s progress
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <h1 className="font-db-serif text-2xl font-semibold">Your document checklist</h1>
      {data && (
        <p className="mt-2 text-db-muted">
          {data.documents.length === 0
            ? 'Send documents in any order, at your own pace — photos from your phone are fine.'
            : `${data.documents.length} file${data.documents.length === 1 ? '' : 's'} received.`}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void upload(f)
          e.target.value = ''
        }}
      />

      {/* Echo-back cards (UI spec §5.5): the pipeline's guess, the family's verdict */}
      {data?.documents
        .filter((d) => d.suggestedChecklistItemId && !d.classificationConfirmed && !d.quarantined)
        .map((d) => {
          const item = data.items.find((i) => i.id === d.suggestedChecklistItemId)
          return (
            <div key={d.id} data-testid="echoback" className="mt-4 rounded-xl border-2 border-db-accent bg-db-surface p-4">
              <p>
                <span className="font-db-mono text-sm text-db-muted">{d.filename}</span> — this looks
                like <strong>{item?.label ?? 'one of your documents'}</strong>.
              </p>
              {correcting === d.id ? (
                <div className="mt-3">
                  <label className="text-sm font-semibold">What is it really?</label>
                  <div className="mt-2 space-y-2">
                    {data.items.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => void verdict(d.id, 'correct', i.id)}
                        className="block w-full rounded-lg border border-db-line p-2 text-left text-sm hover:border-db-accent"
                      >
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() => void verdict(d.id, 'confirm')}
                    className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface"
                  >
                    That&rsquo;s right
                  </button>
                  <button
                    onClick={() => setCorrecting(d.id)}
                    className="rounded-lg border border-db-line px-4 py-2 text-sm"
                  >
                    No, let me fix it
                  </button>
                </div>
              )}
            </div>
          )
        })}

      {/* Quarantine notice (ENG-4): honest, never alarming about their case */}
      {data?.documents.filter((d) => d.quarantined).map((d) => (
        <p key={d.id} role="alert" className="mt-4 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
          We couldn&rsquo;t accept <span className="font-db-mono">{d.filename}</span> — our safety
          scan flagged the file itself (not your case). Try re-scanning or photographing those
          pages and uploading again; your other documents are unaffected.
        </p>
      ))}

      {/* Shoebox path — first-class (UI spec §5.5) */}
      <div className="mt-6 rounded-xl border-2 border-dashed border-db-line bg-db-surface p-4">
        <p className="font-semibold">Not sure what a paper is?</p>
        <p className="mt-1 text-sm text-db-muted">
          Upload it anyway — we&rsquo;ll figure out what it is.
        </p>
        <button
          onClick={() => pickFile(null)}
          disabled={uploading !== null}
          className="mt-3 rounded-lg border border-db-accent px-4 py-2 text-sm font-semibold text-db-accent disabled:opacity-40"
        >
          {uploading === 'shoebox' ? 'Uploading…' : 'Upload a document'}
        </button>
      </div>

      <ul className="mt-4 space-y-3">
        {data?.items.map((item) => (
          <li key={item.id} className="rounded-xl border border-db-line bg-db-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{item.label}</span>
              <span
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: 'var(--db-accent-soft)',
                  color: item.state === 'NEEDED' ? 'var(--db-muted)' : 'var(--db-accent)',
                }}
              >
                {item.state === 'NEEDED' ? 'Needed' : 'Received'}
              </span>
            </div>
            <details className="mt-2 text-sm text-db-muted">
              <summary className="cursor-pointer">Don&rsquo;t have this? Here&rsquo;s how to get it</summary>
              <p className="mt-1">{HOWTO[item.kind] ?? 'The district clerk of the county of conviction is the place to start.'}</p>
            </details>
            <button
              onClick={() => pickFile(item.label)}
              disabled={uploading !== null}
              className="mt-3 rounded-lg border border-db-accent px-4 py-2 text-sm font-semibold text-db-accent disabled:opacity-40"
            >
              {uploading === item.label ? 'Uploading…' : 'Upload for this item'}
            </button>
          </li>
        ))}
      </ul>

      {/* Page meter (ENG-3): the same authority billing reads */}
      {meter && meter.billable > 0 && (
        <p className="mt-6 rounded-lg border border-db-line bg-db-surface p-3 text-sm">
          <span className="font-db-mono">{meter.billable.toLocaleString()} / {meter.cap.toLocaleString()}</span> pages
          {meter.duplicatesIgnored > 0 && (
            <span className="block text-db-muted">
              Duplicates ignored: {meter.duplicatesIgnored} — they don&rsquo;t count toward your
              pages, but we still read every page you send.
            </span>
          )}
        </p>
      )}

      <div className="mt-8 rounded-xl border border-db-line bg-db-surface p-4">
        <p className="text-sm text-db-muted">
          Records arrive over weeks for most families — save and come back any time. When
          everything you can get is here:
        </p>
        <button
          onClick={markComplete}
          disabled={!data || data.documents.length === 0}
          className="mt-3 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
        >
          My records are complete — start the review
        </button>
      </div>
    </main>
  )
}
