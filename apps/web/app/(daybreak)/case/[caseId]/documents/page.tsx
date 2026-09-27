'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import CaseNav from '../../../../../components/daybreak/CaseNav'
import { formatCivilDate } from '@/lib/tracker'
import { checklistReadiness, docPriority, TIERS, TIER_META, type DocTier } from '@hg/case-lifecycle'

/**
 * S2/S3 checklist home (UI spec §5.4–5.5): per-item upload embedded in the
 * checklist, the shoebox path first-class, and the explicit celebrated
 * "records complete" moment that starts the clock.
 *
 * Layout (UX round 7, 2026-09-27 — "it's a little confusing"): the page
 * answers three questions in order, each in one card.
 *   1. What does the review need, and is what I have enough?  → checklist
 *      card: the verdict on top, every item in one list (essential first),
 *      received items ticked, still-needed items with where to get them.
 *   2. How do I add more?                                     → upload card.
 *   3. What have I already sent?                              → "Your files"
 *      DIRECTLY under the upload, open by default, each file with what we
 *      recognized it as — so nobody uploads the same file twice. A file
 *      whose name matches one already here asks before uploading again.
 *   Then Step 2, the run. Secondary facts ("About this case") sit last.
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
  factLines?: Array<{ key: string; label: string; value: string | null; derived?: boolean; shapesReview?: boolean }>
  facts?: { source?: { carriedFromCaseId?: string } }
  rerun?: { reportCount: number; lastReportAt: string | null } | null
}
interface Meter {
  billable: number
  duplicatesIgnored: number
  cap: number
}

/** Tier colors: essential reads as urgent, strengthens as the accent, helpful as muted. */
const TIER_COLOR: Record<DocTier, string> = { essential: 'var(--db-urgent)', strengthens: 'var(--db-accent)', helpful: 'var(--db-muted)' }


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
  // Stalled/cancelled uploads (2026-09-12: a phone upload hung with the bar
  // frozen and every control disabled — locking the screen pauses the PUT
  // and the browser never reports it). A watchdog aborts a silent PUT, the
  // bar has Cancel, and failed files can be retried in one tap.
  const activeXhr = useRef<XMLHttpRequest | null>(null)
  const cancelled = useRef(false)
  const [failedFiles, setFailedFiles] = useState<File[]>([])
  // Files the family chose not to upload again because a file with the
  // same name is already here (UX round 7).
  const [skipped, setSkipped] = useState<string[]>([])
  // Removing files (2026-09-27): tick one or several, or Remove on a row.
  // Only while the case is still collecting — the API refuses otherwise.
  const [selected, setSelected] = useState<string[]>([])
  const [removing, setRemoving] = useState(false)
  const [notice, setNotice] = useState('')
  const [pollBudget, setPollBudget] = useState(0)
  const [confirmRun, setConfirmRun] = useState(false)
  // Document priority: one computation per checklist load, used by the
  // readiness line, the Step 2 note, and the run dialog.
  const readiness = useMemo(() => (data ? checklistReadiness(data.items) : null), [data])
  const unnamed = useMemo(() => (data ? data.documents.filter((d) => !d.quarantined && !d.suggestedChecklistItemId) : []), [data])
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
      activeXhr.current = xhr
      cancelled.current = false
      let lastProgress = Date.now()
      let stalled = false
      const STALL_MS = 45_000
      const finish = () => {
        clearInterval(watchdog)
        document.removeEventListener('visibilitychange', onVisible)
        if (activeXhr.current === xhr) activeXhr.current = null
      }
      const stall = () => {
        stalled = true
        xhr.abort()
      }
      // No progress for 45 s → the connection is dead (phone locked, network
      // switched). Coming back to the tab after a long silence counts too.
      const watchdog = setInterval(() => { if (Date.now() - lastProgress > STALL_MS) stall() }, 5_000)
      const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastProgress > 15_000) stall() }
      document.addEventListener('visibilitychange', onVisible)
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        lastProgress = Date.now()
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setProgress((prev) => (prev ? { ...prev, pct } : prev))
        }
      }
      xhr.onload = () => {
        finish()
        return xhr.status < 300
          ? resolve()
          : reject(new Error('The upload didn’t reach our storage — please try again.'))
      }
      xhr.onerror = () => {
        finish()
        reject(new Error('The upload didn’t reach our storage — check your connection and try again.'))
      }
      xhr.onabort = () => {
        finish()
        reject(new Error(cancelled.current
          ? `Upload cancelled — nothing was saved for ${file.name}.`
          : `The upload of ${file.name} stalled — this happens when a phone locks its screen or changes networks. Tap Retry to send it again.`))
        void stalled
      }
      xhr.send(file)
    })

  const cancelUpload = () => {
    cancelled.current = true
    activeXhr.current?.abort()
  }

  // One entry point for everything (F1): ZIPs route to the bulk path, other
  // files upload sequentially so a mid-batch failure keeps its progress.
  const handleFiles = async (chosen: File[]) => {
    const failed: File[] = []
    setFailedFiles([])
    // Same name as a file already here? Ask before sending it again. The
    // pipeline ignores duplicate pages anyway, but a second copy on the
    // list is what made families unsure whether the first one arrived.
    const already = new Set((data?.documents ?? []).filter((d) => !d.quarantined).map((d) => d.filename))
    const skippedNow: string[] = []
    const files = chosen.filter((f) => {
      if (!already.has(f.name)) return true
      if (window.confirm(`${f.name} is already in your files below. Upload it again anyway?`)) return true
      skippedNow.push(f.name)
      return false
    })
    setSkipped(skippedNow)
    if (files.length === 0) return
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        setProgress({ name: f.name, pct: 0, index: i + 1, total: files.length })
        let ok: boolean
        if (/\.zip$/i.test(f.name)) {
          setZipBusy('uploading')
          ok = await upload(f)
          setZipBusy((z) => (z === 'uploading' ? null : z))
        } else {
          ok = await upload(f)
        }
        if (!ok) {
          failed.push(f)
          // A cancel stops the whole batch; the rest can be retried together.
          if (cancelled.current) { failed.push(...files.slice(i + 1)); break }
        }
      }
    } finally {
      setProgress(null)
      setFailedFiles(failed)
    }
  }

  const upload = async (file: File): Promise<boolean> => {
    setError('')
    setUploading(pendingItem.current ?? 'shoebox')
    try {
      const presign = await apiFetch('/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, caseId }),
      })
      if (!presign.ok) {
        // Show the server's reason (e.g. "AWS credentials not configured")
        // instead of a dead-end generic — a config fault must be diagnosable
        // from the page (2026-09-05).
        const body = (await presign.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Could not start the upload (error ${presign.status}) — please try again.`)
      }
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
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — please try again.')
      return false
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


  const removeFiles = async (ids: string[]) => {
    const names = ids.map((id) => data?.documents.find((d) => d.id === id)?.filename ?? 'this file')
    const what = names.length === 1 ? names[0] : `these ${names.length} files`
    if (!window.confirm(`Remove ${what} from your review? The file and every page we read from it will be deleted. You can upload it again later.`)) return
    setError(''); setNotice(''); setRemoving(true)
    try {
      const res = ids.length === 1
        ? await apiFetch(`/cases/${caseId}/documents/${ids[0]}`, { method: 'DELETE' })
        : await apiFetch(`/cases/${caseId}/documents/remove`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentIds: ids }) })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not remove that file right now.')
      } else {
        const removed = (body.removed ?? []) as { filename: string }[]
        const refused = Object.values((body.refusedWhy ?? {}) as Record<string, string>)
        setNotice(`Removed ${removed.length === 1 ? removed[0].filename : `${removed.length} files`}.${refused.length ? ` ${refused.join(' ')}` : ''}`)
      }
      setSelected([])
      await refresh()
    } catch (e) {
      setError(`Could not remove — the request didn’t reach us (${(e as Error).message}).`)
    } finally {
      setRemoving(false)
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
            The clock starts now{readyBy ? ` — expect your report by ${formatCivilDate(readyBy)}` : ''}. We&rsquo;ll email you at every step, and you can watch progress any time.
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

  const items = data?.items ?? []
  const needed = items.filter((i) => i.state === 'NEEDED')
  const received = items.filter((i) => i.state !== 'NEEDED')
  const files = (data?.documents ?? []).filter((d) => !d.quarantined)
  const quarantined = (data?.documents ?? []).filter((d) => d.quarantined)
  const itemLabel = (id: string | null) => items.find((i) => i.id === id)?.label ?? null
  const factLine = (k: string) => data?.factLines?.find((l) => l.key === k)?.value ?? null
  const builtFor = (() => {
    const how = factLine('trialOrPlea'); const where = factLine('conviction')?.split(' · ')[0]; const prior = factLine('priorWrit')
    if (!how && !where) return null
    return `Built for ${how === 'A trial' ? 'a trial' : how ? 'a plea' : 'a conviction'}${where ? ` in ${where}` : ''}${prior?.startsWith('Yes') ? ', with a prior writ' : ''}.`
  })()
  const editable = data?.status === 'AWAITING_DOCS'
  const busy = uploading !== null || zipBusy !== null || removing
  const canRemove = editable && !busy

  /** One picker for "which document is this?" — echo-back fixes and unnamed files alike. */
  const ItemPicker = ({ docId }: { docId: string }) => (
    <div className="mt-2 rounded-lg border border-db-line p-3" data-testid={`name-file-picker-${docId}`}>
      <p className="text-sm font-semibold">Which document is this?</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((i) => (
          <button key={i.id} onClick={() => void verdict(docId, 'correct', i.id)} className="rounded-lg border border-db-line px-3 py-2 text-left text-sm hover:border-db-accent">
            {i.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <CaseNav caseId={caseId} current="documents" />
      <h1 className="font-db-serif text-2xl font-semibold">Your documents</h1>
      <p className="mt-1 text-sm text-db-muted">
        Any order, your own pace — we recognize each document and check it off for you. Uploading is always free; the review runs once, when you say so.
      </p>

      {data?.rerun && (
        <div data-testid="rerun-banner" className="mt-4 rounded-xl border-2 border-db-accent bg-db-accent-soft p-4 text-sm">
          <p className="font-semibold">This is a re-run.</p>
          <p className="mt-1">
            Your report{data.rerun.lastReportAt ? ` from ${new Date(data.rerun.lastReportAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : ''} still stands and stays available.
            Add the new documents below, then start the re-run. Everything you told us about the case is already saved.
          </p>
        </div>
      )}

      {/* F11: the phase model, always visible — collecting is free and
          iterative; running the review is the (charged) commitment. */}
      <ol className="mt-4 flex flex-wrap items-center gap-2 text-sm" data-testid="phase-steps" aria-label="Steps">
        <li className="rounded-full bg-db-accent px-3 py-1 font-semibold text-db-surface">Step 1 · Collect &amp; upload</li>
        <li aria-hidden className="text-db-muted">→</li>
        <li className="rounded-full border border-db-line px-3 py-1 font-semibold text-db-muted">Step 2 · Run your review</li>
      </ol>

      {notice && (
        <p role="status" data-testid="files-notice" className="mt-4 rounded-xl border border-db-line bg-db-surface p-3 text-sm">{notice}</p>
      )}
      {error && (
        <p role="alert" data-testid="upload-error" className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>
          {error}
          {failedFiles.length > 0 && !progress && (
            <button
              type="button"
              onClick={() => void handleFiles(failedFiles)}
              className="ml-2 rounded-lg bg-db-accent px-3 py-1 text-sm font-semibold text-db-surface"
              data-testid="upload-retry"
            >
              Retry {failedFiles.length === 1 ? failedFiles[0].name : `${failedFiles.length} files`}
            </button>
          )}
        </p>
      )}

      {/* ── 1. What the review needs — the verdict, then every item ── */}
      {data && items.length > 0 && (
        <section data-testid="checklist-card" className="mt-5 overflow-hidden rounded-xl border border-db-line bg-db-surface">
          <div className="p-4">
            <h2 className="font-db-serif text-lg font-semibold">What the review needs</h2>
            {builtFor && (
              <p className="mt-0.5 text-sm text-db-muted" data-testid="checklist-why">
                {builtFor}{editable && <> <Link href={`/case/${caseId}/interview`} className="text-db-accent underline">Not right?</Link></>}
              </p>
            )}
            {/* Document priority (PO, 2026-09-12): the question is not "how
                many" but "is it enough" — answered first, in one line. */}
            {readiness && (readiness.enough ? (
              <p className="mt-3 rounded-lg bg-db-accent-soft px-3 py-2 text-sm font-semibold" style={{ color: 'var(--db-signal)' }} data-testid="readiness" data-enough="true">
                ✓ You have what the review needs.{readiness.missing.strengthens.length + readiness.missing.helpful.length > 0 ? ' The rest would make it stronger — get what you can.' : ' You can start it whenever you are ready.'}
              </p>
            ) : (
              <p className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }} data-testid="readiness" data-enough="false">
                Not enough yet — the review depends on: {readiness.missing.essential.map((m) => m.label).join(', ')}.
                {unnamed.length > 0 && pollBudget === 0 && (
                  <span className="mt-1 block font-normal text-db-ink" data-testid="readiness-unnamed">
                    We could not name {unnamed.length} of your files. If one of them is what is missing, name it under &ldquo;Your files&rdquo; below.
                  </span>
                )}
              </p>
            ))}
            {/* F2: "how close am I?" — always answered. */}
            <div className="mt-3" data-testid="doc-progress">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold">Documents found: {received.length} of {items.length}</span>
                <span className="text-db-muted">{needed.length === 0 ? 'Everything is here' : `${needed.length} still needed`}</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
                <div className="h-full rounded-full transition-all" style={{ background: 'var(--db-accent)', width: `${Math.round((received.length / items.length) * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* F10/F12: what is left is the visible list — still-needed rows
              first, grouped by tier (essential on top), with the how-to
              inside each row; received rows below, one line each. */}
          {needed.length > 0 && (
            <div data-testid="still-needed" className="border-t border-db-line">
              <div className="flex items-baseline justify-between gap-3 px-4 pb-1 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-db-muted">Still needed ({needed.length})</h3>
              </div>
              <p className="px-4 pb-2 text-sm text-db-muted">
                {needed.length <= 2
                  ? 'If you can get these, upload each one on its own — a single PDF or a few photos is perfect.'
                  : 'If you can gather these, put them all in one ZIP and send them in one go — or upload them one at a time.'}{' '}
                Tap an item for who to ask.
              </p>
              <ul>
                {TIERS.map((tier) => {
                  const rows = needed.filter((i) => docPriority(i.kind).tier === tier)
                  if (rows.length === 0) return null
                  return (
                    <li key={tier} data-testid={`tier-${tier}`}>
                      <p className="border-y border-db-line bg-db-bg px-4 py-1 text-xs font-semibold" style={{ color: TIER_COLOR[tier] }}>{TIER_META[tier].heading}</p>
                      <ul>
                        {rows.map((item) => (
                          <li key={item.id} className="border-b border-db-line last:border-b-0">
                            <details>
                              <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                                <span aria-hidden className="inline-block h-5 w-5 shrink-0 rounded-full border-2" style={{ borderColor: TIER_COLOR[tier] }} />
                                <span className="min-w-0 flex-1 text-sm font-semibold">{item.label}</span>
                                <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold" style={{ color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }} data-testid={`tier-chip-${item.kind}`}>{TIER_META[tier].label}</span>
                                <span aria-hidden className="text-db-muted">›</span>
                              </summary>
                              <div className="px-4 pb-3 pl-12 text-sm text-db-muted">
                                <p className="text-db-ink" data-testid={`without-${item.kind}`}><span className="font-semibold">Without it:</span> {docPriority(item.kind).without}</p>
                                <p className="mt-1"><span className="font-semibold">Where to get it:</span> {docPriority(item.kind).howTo}</p>
                                <button
                                  onClick={() => pickFile(item.label)}
                                  disabled={busy}
                                  className="mt-2 rounded-lg border border-db-accent px-3 py-1.5 text-sm font-semibold text-db-accent disabled:opacity-40"
                                >
                                  {uploading === item.label ? 'Uploading…' : 'Upload this document'}
                                </button>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {received.length > 0 && (
            <div data-testid="received" className="border-t border-db-line">
              <h3 className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-db-muted">Received ({received.length})</h3>
              <ul>
                {received.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 border-t border-db-line px-4 py-2.5">
                    <span aria-hidden className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-db-surface" style={{ background: item.state === 'PROBLEM' ? 'var(--db-urgent)' : 'var(--db-signal)' }}>{item.state === 'PROBLEM' ? '!' : '✓'}</span>
                    <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                    <span className="whitespace-nowrap text-xs font-semibold" style={{ color: item.state === 'PROBLEM' ? 'var(--db-urgent)' : 'var(--db-signal)' }}>
                      {item.state === 'PROBLEM' ? 'Needs attention' : item.state === 'CONFIRMED' ? '✓ Confirmed' : '✓ Received'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── 2. Add documents — ONE zone that takes anything (F1) ── */}
      <section
        data-testid="zip-card"
        className="mt-4 rounded-xl border-2 border-dashed border-db-accent bg-db-surface p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const dropped = Array.from(e.dataTransfer.files ?? [])
          if (dropped.length) void handleFiles(dropped)
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-db-serif text-lg font-semibold">Add your documents</h2>
            <p className="mt-0.5 text-sm text-db-muted">
              PDFs and phone photos both work — several at once, or one <strong>ZIP file</strong> with everything inside. Not sure what a paper is? Add it anyway.
            </p>
          </div>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="w-full rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40 sm:w-auto sm:px-6"
          >
            {zipBusy === 'uploading' ? 'Uploading your ZIP…' : zipBusy === 'unpacking' ? 'Opening your ZIP…' : uploading !== null ? 'Uploading…' : 'Add files'}
          </button>
        </div>
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
        {progress && (
          <div className="mt-3" data-testid="upload-progress">
            <p className="text-sm">
              Uploading{progress.total > 1 ? ` file ${progress.index} of ${progress.total}` : ''}:{' '}
              <span className="font-db-mono">{progress.name}</span> —{' '}
              <span className="font-semibold">{progress.pct}%</span>
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
              <div className="h-full rounded-full transition-all" style={{ background: 'var(--db-accent)', width: `${progress.pct}%` }} />
            </div>
            <p className="mt-1 text-sm text-db-muted">
              Keep this page open and your screen unlocked until the bar finishes — a slow connection is fine, it just takes longer; on a phone, locking the screen can pause the upload.
              <button type="button" onClick={cancelUpload} className="ml-2 font-semibold text-db-accent underline" data-testid="upload-cancel">Cancel</button>
            </p>
          </div>
        )}
        {skipped.length > 0 && !progress && (
          <p className="mt-2 text-sm text-db-muted" data-testid="upload-skipped">
            Skipped {skipped.join(', ')} — already in your files below.
          </p>
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
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) void handleFiles(picked)
          e.target.value = ''
        }}
      />

      {/* ── 3. Your files — right under the upload, open, one row per file
             with what we recognized it as. Echo-back (UI spec §5.5) lives
             in the row: the pipeline's guess, the family's verdict. ── */}
      {data && (files.length > 0 || quarantined.length > 0) && (
        <details className="mt-4 rounded-xl border border-db-line bg-db-surface" open data-testid="your-files">
          <summary className="flex cursor-pointer items-baseline justify-between gap-3 p-4">
            <span className="font-db-serif text-lg font-semibold">Your files ({files.length})</span>
            <span className="text-xs text-db-muted">Already uploaded — no need to send these again</span>
          </summary>
          <p className="px-4 text-sm text-db-muted">
            Every file stays yours — download any of them to hand to a lawyer.
            {editable && ' Sent the wrong file, or the same one twice? Remove it here.'}
            {unnamed.length > 0 && pollBudget === 0 && ' A file we could not name still gets read — naming it just checks the right item off your list.'}
          </p>
          {editable && selected.length > 1 && (
            <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg border border-db-line bg-db-bg px-3 py-2 text-sm" data-testid="remove-selected-bar">
              <span>{selected.length} files selected</span>
              <span className="flex gap-3">
                <button onClick={() => setSelected([])} className="text-db-muted underline">Clear</button>
                <button onClick={() => void removeFiles(selected)} disabled={!canRemove} className="font-semibold underline disabled:opacity-40" style={{ color: 'var(--db-urgent)' }} data-testid="remove-selected">Remove {selected.length} files</button>
              </span>
            </div>
          )}
          <ul className="mt-2 border-t border-db-line">
            {files.map((d) => {
              const label = itemLabel(d.suggestedChecklistItemId)
              const askConfirm = !!d.suggestedChecklistItemId && !d.classificationConfirmed
              return (
                <li key={d.id} className="border-b border-db-line px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    {editable && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${d.filename}`}
                        checked={selected.includes(d.id)}
                        onChange={(e) => setSelected((cur) => (e.target.checked ? [...cur, d.id] : cur.filter((x) => x !== d.id)))}
                        className="h-4 w-4 shrink-0"
                        data-testid={`select-file-${d.id}`}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-db-mono text-sm">{d.filename}</p>
                      <p className="text-xs text-db-muted">
                        {d.suggestedChecklistItemId
                          ? `${d.classificationConfirmed ? '✓ Confirmed' : '✓ Recognized'}${label ? ` as ${label}` : ''}`
                          : pollBudget > 0
                            ? 'Reading it now…'
                            : 'Received — we could not tell what it is'}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-3 whitespace-nowrap text-sm">
                      {/* Engineering review (2026-09-12): a file the classifier
                          could not name had no way to be named. */}
                      {!d.suggestedChecklistItemId && pollBudget === 0 && (
                        <button onClick={() => setCorrecting(correcting === d.id ? null : d.id)} className="font-semibold text-db-accent underline" data-testid={`name-file-${d.id}`}>
                          Name this file
                        </button>
                      )}
                      <button onClick={() => void download(d.id)} className="font-semibold text-db-accent underline">
                        Download
                      </button>
                      {editable && (
                        <button onClick={() => void removeFiles([d.id])} disabled={!canRemove} className="underline disabled:opacity-40" style={{ color: 'var(--db-urgent)' }} data-testid={`remove-file-${d.id}`}>
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                  {askConfirm && (
                    <div data-testid="echoback" className="mt-2 rounded-lg bg-db-accent-soft p-3 text-sm">
                      <p>
                        Quick check — this looks like <strong>{label ?? 'one of your documents'}</strong>. Did we name it right?
                      </p>
                      {correcting === d.id ? (
                        <div className="mt-2">
                          <label className="text-sm font-semibold">What is it really?</label>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            {items.map((i) => (
                              <button key={i.id} onClick={() => void verdict(d.id, 'correct', i.id)} className="rounded-lg border border-db-line bg-db-surface px-3 py-2 text-left text-sm hover:border-db-accent">
                                {i.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button onClick={() => void verdict(d.id, 'confirm')} className="rounded-lg bg-db-accent px-4 py-2 text-sm font-semibold text-db-surface">
                            That&rsquo;s right
                          </button>
                          <button onClick={() => setCorrecting(d.id)} className="rounded-lg border border-db-line bg-db-surface px-4 py-2 text-sm">
                            No, let me fix it
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {correcting === d.id && !d.suggestedChecklistItemId && <ItemPicker docId={d.id} />}
                </li>
              )
            })}
            {/* Quarantine notice (ENG-4): honest, never alarming about their case */}
            {quarantined.map((d) => (
              <li key={d.id} role="alert" className="border-b border-db-line px-4 py-3 text-sm last:border-b-0" style={{ color: 'var(--db-urgent)' }}>
                We couldn&rsquo;t accept <span className="font-db-mono">{d.filename}</span> — our safety
                scan flagged the file itself (not your case). Try re-scanning or photographing those
                pages and uploading again; your other documents are unaffected.
              </li>
            ))}
          </ul>
          {/* Page meter (ENG-3): the same authority billing reads */}
          {meter && meter.billable > 0 && (
            <p className="border-t border-db-line px-4 py-3 text-sm">
              <span className="font-db-mono">{meter.billable.toLocaleString()} / {meter.cap.toLocaleString()}</span> pages read so far
              {meter.duplicatesIgnored > 0 && (
                <span className="block text-db-muted">
                  Duplicates ignored: {meter.duplicatesIgnored} — they don&rsquo;t count toward your
                  pages, but we still read every page you send.
                </span>
              )}
            </p>
          )}
        </details>
      )}

      {/* ── Step 2: its own moment — the charged commitment, with the cost
             rule stated here, not first discovered inside the modal. ── */}
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
        {readiness && !readiness.enough && (
          <p className="mt-2 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)' }} data-testid="run-not-enough">
            <strong>Not enough yet.</strong> The review depends on: {readiness.missing.essential.map((m) => m.label).join(', ')}. You can still run it on what is here, but it will only be able to check the paperwork.
          </p>
        )}
        {needed.length > 0 ? (
          <button
            onClick={() => setConfirmRun(true)}
            disabled={!data || data.documents.length === 0}
            className="mt-3 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            {data?.rerun ? 'That’s everything new I could get — start the re-run' : 'That’s everything I could get — start the review'}
          </button>
        ) : (
          <button
            onClick={markComplete}
            disabled={!data || data.documents.length === 0}
            className="mt-3 w-full rounded-xl bg-db-accent px-6 py-4 text-lg font-semibold text-db-surface disabled:opacity-40"
          >
            {data?.rerun ? 'My new documents are in — start the re-run' : 'My records are complete — start the review'}
          </button>
        )}
      </section>

      {/* Secondary: what the checklist was built from. */}
      {data?.factLines?.some((l) => l.value) && (
        <details data-testid="about-case" className="mt-6 rounded-xl border border-db-line bg-db-surface p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            About this case
            <span className="ml-2 font-normal text-db-muted">
              {factLine('conviction') ?? ''}
              {factLine('trialOrPlea') ? ` · ${factLine('trialOrPlea')}` : ''}
            </span>
          </summary>
          <p className="mt-2 text-xs text-db-muted">Your checklist is built from these answers.</p>
          {data.facts?.source?.carriedFromCaseId && (
            <p className="mt-1 text-xs" data-testid="carried-over">
              County, year and dates were carried over from your earlier review so you were not asked again.{' '}
              {editable && <>Not the same case? <Link href={`/case/${caseId}/interview`} className="text-db-accent underline">Change the details</Link>.</>}
            </p>
          )}
          <dl className="mt-2 grid grid-cols-[minmax(0,40%)_1fr] gap-x-4 gap-y-1.5">
            {data.factLines.filter((l) => l.value).map((l) => (
              <div key={l.key} className="contents">
                <dt className="text-db-muted">{l.label}</dt>
                <dd>{l.value}{l.derived && <span className="ml-1 text-xs text-db-muted">(chosen from your answers)</span>}</dd>
              </div>
            ))}
          </dl>
          {editable ? (
            <Link href={`/case/${caseId}/interview`} className="mt-3 inline-block text-db-accent underline">Not right? Change the details</Link>
          ) : (
            <p className="mt-3 text-xs text-db-muted">Locked — this review was built on these answers. A re-run is where they can change.</p>
          )}
        </details>
      )}

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
            {readiness && (() => {
              const r = readiness
              const list = (tier: DocTier) => r.missing[tier].length > 0 && (
                <p className="mt-2 text-sm" data-testid={`confirm-missing-${tier}`}>
                  <span className="font-semibold" style={{ color: TIER_COLOR[tier] }}>{TIER_META[tier].label}:</span>{' '}
                  {r.missing[tier].map((m) => m.label).join(', ')}
                </p>
              )
              return r.enough ? (
                <>
                  <h2 className="font-db-serif text-xl font-semibold">Run the review without every document?</h2>
                  <p className="mt-2 text-sm" data-testid="confirm-verdict">
                    <strong>You have what the review needs.</strong> The items still missing would make it stronger, and many families cannot get everything — we will review what is here.
                  </p>
                  {list('strengthens')}
                  {list('helpful')}
                </>
              ) : (
                <>
                  <h2 className="font-db-serif text-xl font-semibold">Run without the documents the review depends on?</h2>
                  <p className="mt-2 text-sm" data-testid="confirm-verdict">
                    <strong>Still missing — essential:</strong> {r.missing.essential.map((m) => m.label).join(', ')}.{' '}
                    {r.missing.essential.map((m) => m.without).join(' ')}
                  </p>
                  {list('strengthens')}
                  {list('helpful')}
                  <p className="mt-2 text-sm">If there is any way to get {r.missing.essential.length === 1 ? 'it' : 'them'}, wait — this is the one run your purchase includes.</p>
                </>
              )
            })()}
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
                {readiness?.enough ? 'I understand — run my review now' : 'I understand — run my review now on the paperwork only'}
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
