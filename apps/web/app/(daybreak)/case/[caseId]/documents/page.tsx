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
  const zipInput = useRef<HTMLInputElement>(null)
  const [zipBusy, setZipBusy] = useState<'uploading' | 'unpacking' | null>(null)
  const zipStartedAt = useRef<number>(0)
  const [pollBudget, setPollBudget] = useState(0)
  const [confirmRun, setConfirmRun] = useState(false)

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
      // says no, the customer must hear it.
      const put = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
      if (!put.ok) throw new Error('The upload didn’t reach our storage — please try again.')

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
      <h1 className="font-db-serif text-2xl font-semibold">Your document checklist</h1>
      {data && (
        <p className="mt-2 text-db-muted">
          {data.documents.length === 0
            ? 'Send documents in any order, at your own pace — photos from your phone are fine, and you can select several files at once. Big files can take a few minutes on cell service; keep this page open.'
            : `${data.documents.length} file${data.documents.length === 1 ? '' : 's'} received.`}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--db-urgent)' }}>
          {error}
        </p>
      )}

      {/* Bulk ZIP path (bulk_zip_upload.md): one file instead of a checklist crawl */}
      <section data-testid="zip-card" className="mt-6 rounded-xl border-2 border-db-accent bg-db-surface p-4">
        <h2 className="font-db-serif text-lg font-semibold">Have a lot of files? Send them all at once</h2>
        <p className="mt-1 text-sm text-db-muted">
          Put everything into one <strong>ZIP file</strong> and upload it in a single step.
          A ZIP is one file that holds many files inside it — like a folder squeezed into a
          single package. We&rsquo;ll open it, read every document, and check items off your
          list below as we recognize them.
        </p>
        <details className="mt-2 text-sm text-db-muted">
          <summary className="cursor-pointer font-semibold text-db-ink">How do I make a ZIP file?</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Windows:</strong> put your documents in one folder, right-click the folder, choose <em>Send to</em> → <em>Compressed (zipped) folder</em>.</li>
            <li><strong>Mac:</strong> put them in one folder, right-click (or hold Control and click) the folder, choose <em>Compress</em>.</li>
            <li><strong>iPhone/iPad:</strong> in the <em>Files</em> app, touch and hold the folder, choose <em>Compress</em>.</li>
            <li><strong>Android:</strong> in the <em>Files by Google</em> app, select the files, tap the three dots, choose <em>Compress</em>.</li>
          </ul>
          <p className="mt-2">
            We can read PDF files and photos (JPG, PNG, HEIC, TIFF) inside the ZIP — anything
            else is skipped and we&rsquo;ll tell you. Uploading one at a time below works just
            as well if a ZIP feels like too much.
          </p>
        </details>
        <button
          onClick={() => zipInput.current?.click()}
          disabled={uploading !== null || zipBusy !== null}
          className="mt-3 rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface disabled:opacity-40"
        >
          {zipBusy === 'uploading' ? 'Uploading your ZIP…' : zipBusy === 'unpacking' ? 'Opening your ZIP…' : 'Upload a ZIP file'}
        </button>
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
        ref={zipInput}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setZipBusy('uploading')
            void upload(f).then(() => setZipBusy((z) => (z === 'uploading' ? null : z)))
          }
          e.target.value = ''
        }}
      />

      {data && data.documents.filter((d) => !d.quarantined).length > 0 && (
        <section className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
          <h2 className="font-db-serif text-lg font-semibold">Your files</h2>
          <p className="mt-1 text-sm text-db-muted">
            Every file stays yours — download any of them to hand to a lawyer.
          </p>
          <ul className="mt-3 space-y-2">
            {data.documents.filter((d) => !d.quarantined).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-db-mono text-sm">{d.filename}</span>
                <button onClick={() => void download(d.id)} className="whitespace-nowrap text-sm font-semibold text-db-accent underline">
                  Download
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}


      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic"
        className="hidden"
        onChange={(e) => {
          // Mobile reality: eight volumes should be ONE picker trip. Files
          // upload sequentially so a mid-batch failure keeps its progress.
          // No `capture` attribute by design — forcing the camera would
          // remove the gallery/files option on Android pickers.
          const files = Array.from(e.target.files ?? [])
          if (files.length) {
            void (async () => {
              for (const f of files) await upload(f)
            })()
          }
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

      {/* The remaining-documents nudge (bulk_zip_upload.md §UX): once files
          are in, point at the gaps and match the ask to their size. */}
      {data && data.documents.length > 0 && data.items.some((i) => i.state === 'NEEDED') && (
        <div data-testid="still-needed" className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
          <p className="font-semibold">
            Still missing: {data.items.filter((i) => i.state === 'NEEDED').map((i) => i.label).join(', ')}
          </p>
          <p className="mt-1 text-sm text-db-muted">
            {data.items.filter((i) => i.state === 'NEEDED').length <= 2
              ? 'If you can get these, upload each one on its own — a single PDF or a few photos is perfect. The "how to get it" note under each item tells you who to ask.'
              : 'If you can gather these, you can put them all in one ZIP and send them in one go — or upload them one at a time. The "how to get it" note under each item tells you who to ask.'}
          </p>
        </div>
      )}

      <div className="mt-8 rounded-xl border border-db-line bg-db-surface p-4">
        <p className="text-sm text-db-muted">
          Records arrive over weeks for most families — save and come back any time. When
          everything you can get is here:
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
      </div>

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
