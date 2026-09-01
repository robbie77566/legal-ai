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
interface ZipSummary {
  accepted: number
  skippedUnsupported: number
  skippedTooLarge: number
  skippedJunk: number
  failed: number
  at: string
}
interface ChecklistData {
  status: string
  items: ChecklistItem[]
  documents: CaseDocument[]
  slaStartedAt: string | null
  lastZip: ZipSummary | null
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

  // Bulk ZIP path (bulk_zip_upload.md): the archive unpacks in the
  // background; we poll until its zip.ingested summary lands, then keep a
  // short polling budget so echo-back classifications check items off live.
  const [zipBusy, setZipBusy] = useState<'uploading' | 'unpacking' | null>(null)
  const zipStartedAt = useRef<number>(0)
  const [pollBudget, setPollBudget] = useState(0)
  const [confirmRun, setConfirmRun] = useState(false)
  // F9: real upload progress — fetch() cannot report upload bytes, so the S3
  // PUT rides XHR. Slow cell connections get a moving bar, not a frozen page.
  const [progress, setProgress] = useState<{ name: string; pct: number; index: number; total: number } | null>(null)

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

  // Unpack-complete detection: the checklist's lastZip is newer than the
  // moment we handed the archive over.
  useEffect(() => {
    if (zipBusy === 'unpacking' && data?.lastZip && new Date(data.lastZip.at).getTime() > zipStartedAt.current) {
      setZipBusy(null)
    }
  }, [data, zipBusy])

  // Gentle polling while background work is in flight: an unpacking zip, or
  // freshly uploaded documents still awaiting classification (bounded — the
  // budget stops a document that never classifies from polling forever).
  useEffect(() => {
    const classifying =
      pollBudget > 0 &&
      (data?.documents.some((d) => !d.suggestedChecklistItemId && !d.classificationConfirmed && !d.quarantined) ?? false)
    if (zipBusy !== 'unpacking' && !classifying) return
    const t = setTimeout(() => {
      setPollBudget((b) => Math.max(b - 1, 0))
      void refresh()
    }, 5000)
    return () => clearTimeout(t)
  }, [zipBusy, pollBudget, data, refresh])

  const pickFile = (itemLabel: string | null) => {
    pendingItem.current = itemLabel
    fileInput.current?.click()
  }

  const putWithProgress = (url: string, file: File) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setProgress((prev) => (prev ? { ...prev, pct } : prev))
        }
      }
      xhr.onload = () =>
        xhr.status < 300
          ? resolve()
          : reject(new Error('The upload didn’t reach our storage — please try again.'))
      xhr.onerror = () =>
        reject(new Error('The upload didn’t reach our storage — check your connection and try again.'))
      xhr.send(file)
    })

  // One entry point for everything (F1): ZIPs route to the bulk path, other
  // files upload sequentially so a mid-batch failure keeps its progress.
  const handleFiles = async (files: File[]) => {
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress({ name: f.name, pct: 0, index: i + 1, total: files.length })
        if (/\.zip$/i.test(f.name)) {
          setZipBusy('uploading')
          await upload(f)
          setZipBusy((z) => (z === 'uploading' ? null : z))
        } else {
          await upload(f)
        }
      }
    } finally {
      setProgress(null)
    }
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

      // Honest failure: a swallowed S3 error here once registered documents
      // with NO object behind them (the presign-region 301, 2026-09-01) —
      // the file "arrived" on screen and the pipeline starved. If storage
      // says no, the customer must hear it. XHR, not fetch: upload progress
      // events (F9) only exist on XHR.
      await putWithProgress(url, file)

      const complete = await apiFetch('/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, filename: file.name, s3Key }),
      })
      if (!complete.ok) throw new Error('The upload didn’t finish — please try again.')
      const body = await complete.json().catch(() => ({}))
      if (body.zip) {
        // Archive accepted: unpacking runs in the background — poll for its
        // summary, then keep polling while entries classify.
        zipStartedAt.current = Date.now()
        setZipBusy('unpacking')
        setPollBudget(36)
      } else {
        setPollBudget(24)
      }
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


  const download = async (docId: string) => {
    // Short-TTL signed link fetched on tap (US-11); opening in the same tab
    // triggers the attachment download without a popup blocker fight.
    const res = await apiFetch(`/cases/${caseId}/documents/${docId}/download`)
    if (!res.ok) {
      setError('That file is not available for download right now.')
      return
    }
    const { url } = await res.json()
    window.location.href = url
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
      <h1 className="font-db-serif text-2xl font-semibold">Your documents</h1>
      {/* F11: the phase model, always visible — collecting is free and
          iterative; running the review is the (charged) commitment. */}
      <p className="mt-2 text-sm" data-testid="phase-steps">
        <span className="rounded-full bg-db-accent px-2.5 py-0.5 font-semibold text-db-surface">Step 1 · Collect &amp; upload</span>
        <span className="mx-2 text-db-muted">then</span>
        <span className="rounded-full border border-db-line px-2.5 py-0.5 font-semibold text-db-muted">Step 2 · Run your review</span>
      </p>
      {/* F2: the single highest-leverage motivator on a multi-visit task —
          "how close am I?" — always answered first. */}
      {data && data.items.length > 0 && (
        <div className="mt-3" data-testid="doc-progress">
          <p className="text-sm font-semibold">
            Documents found: {data.items.filter((i) => i.state !== 'NEEDED').length} of {data.items.length}
          </p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                background: 'var(--db-accent)',
                width: `${Math.round((data.items.filter((i) => i.state !== 'NEEDED').length / data.items.length) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-1 text-sm text-db-muted">
            Any order, your own pace — we recognize each document and check it off for you.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}

      {/* F1: ONE upload zone that takes anything — PDFs, photos, or a ZIP of
          everything (bulk_zip_upload.md). The shoebox promise lives here too. */}
      <section
        data-testid="zip-card"
        className="mt-6 rounded-xl border-2 border-dashed border-db-accent bg-db-surface p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const files = Array.from(e.dataTransfer.files ?? [])
          if (files.length) void handleFiles(files)
        }}
      >
        <h2 className="font-db-serif text-lg font-semibold">Add your documents</h2>
        <p className="mt-1 text-sm text-db-muted">
          PDFs and phone photos both work — several at once, or one <strong>ZIP file</strong>{' '}
          with everything inside. Not sure what a paper is? Add it anyway.
        </p>
        <details className="mt-2 text-sm text-db-muted">
          <summary className="cursor-pointer font-semibold text-db-ink">What&rsquo;s a ZIP file, and how do I make one?</summary>
          <p className="mt-2">
            A ZIP is one file that holds many files inside it — like a folder squeezed into a
            single package. Making one takes about a minute:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Windows:</strong> put your documents in one folder, right-click the folder, choose <em>Send to</em> → <em>Compressed (zipped) folder</em>.</li>
            <li><strong>Mac:</strong> put them in one folder, right-click (or hold Control and click) the folder, choose <em>Compress</em>.</li>
            <li><strong>iPhone/iPad:</strong> in the <em>Files</em> app, touch and hold the folder, choose <em>Compress</em>.</li>
            <li><strong>Android:</strong> in the <em>Files by Google</em> app, select the files, tap the three dots, choose <em>Compress</em>.</li>
          </ul>
          <p className="mt-2">
            We can read PDF files and photos (JPG, PNG, HEIC, TIFF) inside the ZIP — anything
            else is skipped and we&rsquo;ll tell you. Uploading files one at a time works just
            as well if a ZIP feels like too much.
          </p>
        </details>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading !== null || zipBusy !== null}
          className="mt-3 w-full rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40 sm:w-auto sm:px-6"
        >
          {zipBusy === 'uploading'
            ? 'Uploading your ZIP…'
            : zipBusy === 'unpacking'
              ? 'Opening your ZIP…'
              : uploading !== null
                ? 'Uploading…'
                : 'Add files'}
        </button>
        {progress && (
          <div className="mt-3" data-testid="upload-progress">
            <p className="text-sm">
              Uploading{progress.total > 1 ? ` file ${progress.index} of ${progress.total}` : ''}:{' '}
              <span className="font-db-mono">{progress.name}</span> —{' '}
              <span className="font-semibold">{progress.pct}%</span>
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ background: 'var(--db-accent)', width: `${progress.pct}%` }}
              />
            </div>
            <p className="mt-1 text-sm text-db-muted">
              Keep this page open until the bar finishes — a slow connection is fine, it just takes longer.
            </p>
          </div>
        )}
        {zipBusy === 'unpacking' && (
          <p className="mt-2 text-sm text-db-muted" data-testid="zip-unpacking">
            We&rsquo;re opening your file and reading what&rsquo;s inside — this can take a few
            minutes for big files. You can leave this page; nothing is lost.
          </p>
        )}
        {zipBusy === null && data?.lastZip && (
          <p className="mt-2 text-sm" data-testid="zip-summary">
            Your ZIP is in: <strong>{data.lastZip.accepted} document{data.lastZip.accepted === 1 ? '' : 's'} added.</strong>
            {data.lastZip.skippedUnsupported + data.lastZip.skippedTooLarge + data.lastZip.failed > 0 && (
              <span className="block text-db-muted">
                {data.lastZip.skippedUnsupported > 0 &&
                  `${data.lastZip.skippedUnsupported} file${data.lastZip.skippedUnsupported === 1 ? '' : 's'} skipped (we can only read PDFs and photos). `}
                {data.lastZip.skippedTooLarge > 0 && `${data.lastZip.skippedTooLarge} skipped for size. `}
                {data.lastZip.failed > 0 && `${data.lastZip.failed} couldn’t be read — try uploading ${data.lastZip.failed === 1 ? 'it' : 'them'} on ${data.lastZip.failed === 1 ? 'its' : 'their'} own. `}
                Skipped files never cost you anything.
              </span>
            )}
          </p>
        )}
      </section>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic,.zip"
        className="hidden"
        onChange={(e) => {
          // Mobile reality: eight volumes should be ONE picker trip. No
          // `capture` attribute by design — forcing the camera would remove
          // the gallery/files option on Android pickers.
          const files = Array.from(e.target.files ?? [])
          if (files.length) void handleFiles(files)
          e.target.value = ''
        }}
      />

      {/* Echo-back cards (UI spec §5.5): the pipeline's guess, the family's
          verdict — grouped under one heading (F6) so they read as one task. */}
      {data && data.documents.some((d) => d.suggestedChecklistItemId && !d.classificationConfirmed && !d.quarantined) && (
        <h2 className="mt-6 font-db-serif text-lg font-semibold">Quick check — did we name these right?</h2>
      )}
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


      {/* F10/F12: what's left is the visible list — dense rows, still-needed
          group open on top (with the how-to inside each row), received rows
          collapsed to one line. */}
      {data && data.items.some((i) => i.state === 'NEEDED') && (
        <section data-testid="still-needed" className="mt-6 rounded-xl border border-db-line bg-db-surface">
          <div className="border-b border-db-line p-4 pb-3">
            <h2 className="font-db-serif text-lg font-semibold">
              Still needed ({data.items.filter((i) => i.state === 'NEEDED').length})
            </h2>
            <p className="mt-1 text-sm text-db-muted">
              {data.items.filter((i) => i.state === 'NEEDED').length <= 2
                ? 'If you can get these, upload each one on its own — a single PDF or a few photos is perfect.'
                : 'If you can gather these, put them all in one ZIP and send them in one go — or upload them one at a time.'}{' '}
              Tap an item for who to ask.
            </p>
          </div>
          <ul>
            {data.items.filter((i) => i.state === 'NEEDED').map((item) => (
              <li key={item.id} className="border-b border-db-line last:border-b-0">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm font-semibold">{item.label}</span>
                    <span className="whitespace-nowrap text-xs font-semibold text-db-muted">Needed ›</span>
                  </summary>
                  <div className="px-4 pb-3 text-sm text-db-muted">
                    <p>{HOWTO[item.kind] ?? 'The district clerk of the county of conviction is the place to start.'}</p>
                    <button
                      onClick={() => pickFile(item.label)}
                      disabled={uploading !== null}
                      className="mt-2 font-semibold text-db-accent underline disabled:opacity-40"
                    >
                      {uploading === item.label ? 'Uploading…' : 'Upload this document'}
                    </button>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.items.some((i) => i.state !== 'NEEDED') && (
        <section className="mt-3 rounded-xl border border-db-line bg-db-surface">
          <ul>
            {data.items.filter((i) => i.state !== 'NEEDED').map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 border-b border-db-line px-4 py-2.5 last:border-b-0">
                <span className="text-sm">{item.label}</span>
                <span
                  className="whitespace-nowrap text-xs font-semibold"
                  style={{ color: item.state === 'PROBLEM' ? 'var(--db-urgent)' : 'var(--db-accent)' }}
                >
                  {item.state === 'PROBLEM' ? 'Needs attention' : item.state === 'CONFIRMED' ? '✓ Confirmed' : '✓ Received'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* F3/F4: files live below the checklist, collapsed, each with its
          processing state — "did my upload work?" answered at a glance. */}
      {data && data.documents.filter((d) => !d.quarantined).length > 0 && (
        <details className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
          <summary className="cursor-pointer font-db-serif text-lg font-semibold">
            Your files ({data.documents.filter((d) => !d.quarantined).length})
          </summary>
          <p className="mt-1 text-sm text-db-muted">
            Every file stays yours — download any of them to hand to a lawyer.
          </p>
          <ul className="mt-3 space-y-2">
            {data.documents.filter((d) => !d.quarantined).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-db-mono text-sm">{d.filename}</span>
                <span className="flex items-center gap-3 whitespace-nowrap text-sm">
                  <span className="text-db-muted">
                    {d.suggestedChecklistItemId
                      ? '✓ Recognized'
                      : pollBudget > 0
                        ? 'Reading it now…'
                        : 'Received'}
                  </span>
                  <button onClick={() => void download(d.id)} className="font-semibold text-db-accent underline">
                    Download
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

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

      {/* F11/F14: Step 2 is its own moment — the charged commitment, with
          the cost rule stated here, not first discovered inside the modal. */}
      <section data-testid="run-review" className="mt-8 rounded-xl border-2 border-db-accent bg-db-surface p-4">
        <p className="text-sm">
          <span className="rounded-full bg-db-accent px-2.5 py-0.5 text-xs font-semibold text-db-surface">Step 2</span>{' '}
          <span className="font-db-serif text-lg font-semibold">Run your review</span>
        </p>
        <p className="mt-2 text-sm text-db-muted">
          Records arrive over weeks for most families — save and come back as often as you need.
          Uploading more documents never costs anything. <strong className="text-db-ink">Your purchase
          includes one analysis run</strong>, and it reads only what&rsquo;s uploaded when you start
          it; a later run with new documents costs $99. So start the review when everything you can
          get is here.
        </p>
        {data && data.items.some((i) => i.state === 'NEEDED') ? (
          <button
            onClick={() => setConfirmRun(true)}
            disabled={!data || data.documents.length === 0}
            className="mt-3 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            That&rsquo;s everything I could get — start the review
          </button>
        ) : (
          <button
            onClick={markComplete}
            disabled={!data || data.documents.length === 0}
            className="mt-3 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            My records are complete — start the review
          </button>
        )}
      </section>

      {/* Informed run-anyway consent (bulk_zip_upload.md §UX): the review can
          run on a partial record, but the cost consequence is stated BEFORE
          the click, never discovered after. */}
      {confirmRun && data && (
        <div
          data-testid="run-anyway-confirm"
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-5"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-db-line bg-db-surface p-5">
            <h2 className="font-db-serif text-xl font-semibold">Run the review without every document?</h2>
            <p className="mt-2 text-sm">
              Some items are still missing:{' '}
              <strong>{data.items.filter((i) => i.state === 'NEEDED').map((i) => i.label).join(', ')}</strong>.
              That&rsquo;s okay — many families can&rsquo;t get everything, and we&rsquo;ll review
              what&rsquo;s here.
            </p>
            <p className="mt-2 text-sm">
              One thing to know first: <strong>your purchase includes one full analysis</strong>, and
              it runs on only the documents uploaded now. Each analysis run costs real computer time
              to execute, so if you find more documents later,{' '}
              <strong>running a new analysis with them costs $99</strong>.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  setConfirmRun(false)
                  void markComplete()
                }}
                className="w-full rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface"
              >
                I understand — run my review now
              </button>
              <button
                onClick={() => setConfirmRun(false)}
                className="w-full rounded-xl border border-db-line px-5 py-3 text-sm"
              >
                Wait — I&rsquo;ll keep collecting documents
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
