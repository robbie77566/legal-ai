'use client'

/**
 * The record uploader for a matter, in the professional voice. Same three
 * api calls the family documents page makes — POST /upload/url (presign),
 * the S3 PUT, POST /upload/complete — with the volume label (workstream D)
 * chosen up front and sent on complete as `volume: { kind, index?, count? }`
 * so every file arrives labelled and confirmed. A ZIP goes through the same
 * door and unpacks in the background. Files upload one at a time so a
 * failure keeps its place; the page refreshes the inventory after each.
 */
import { useRef, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { VOLUME_NAME, type VolumeKind } from './RecordInventoryCard'

interface Props {
  caseId: string
  disabled?: boolean
  onUploaded: () => Promise<void> | void
}

const field = 'rounded-lg border border-db-line bg-db-surface px-2 py-1.5 text-sm'

export default function RecordUploader({ caseId, disabled, onUploaded }: Props) {
  const [kind, setKind] = useState<VolumeKind>('REPORTER')
  const [index, setIndex] = useState('')
  const [count, setCount] = useState('')
  const [progress, setProgress] = useState<{ name: string; pct: number; index: number; total: number } | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 3)

  const put = (url: string, file: File) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress((p) => (p ? { ...p, pct: Math.round((e.loaded / e.total) * 100) } : p))
      }
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error('The upload did not reach storage — try again.')))
      xhr.onerror = () => reject(new Error('The upload did not reach storage — check the connection and try again.'))
      xhr.send(file)
    })

  const uploadOne = async (file: File, i: number, total: number, volumeIndex: number | undefined) => {
    setProgress({ name: file.name, pct: 0, index: i + 1, total })
    const presign = await apiFetch('/upload/url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, caseId }) })
    if (!presign.ok) {
      const body = (await presign.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Could not start the upload (error ${presign.status}).`)
    }
    const { url, s3Key } = (await presign.json()) as { url: string; s3Key: string }
    await put(url, file)
    const isZip = /\.zip$/i.test(file.name)
    const n = (v: string) => (v.trim() === '' ? undefined : Number(v))
    const volume = isZip || kind === 'UNKNOWN' ? undefined : { kind, ...(volumeIndex ? { index: volumeIndex } : {}), ...(n(count) ? { count: n(count) } : {}) }
    const complete = await apiFetch('/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, filename: file.name, s3Key, ...(volume ? { volume } : {}) }),
    })
    if (!complete.ok) throw new Error('The upload did not finish — try again.')
  }

  const handle = async (files: File[]) => {
    if (files.length === 0) return
    setError('')
    setDone([])
    const start = Number(index) || undefined
    try {
      for (let i = 0; i < files.length; i++) {
        // Several files of one kind number consecutively from the volume given.
        await uploadOne(files[i], i, files.length, start ? start + i : undefined)
        setDone((d) => [...d, files[i].name])
        await onUploaded()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed — try again.')
    } finally {
      setProgress(null)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <section data-testid="record-uploader" className="rounded-xl border border-db-line bg-db-surface p-5">
      <h2 className="font-db-serif text-xl font-semibold">Upload the record</h2>
      <p className="mt-1 text-sm text-db-muted">
        PDFs or a ZIP of them. Label each upload with the part of the record it is; the reporter&rsquo;s record sets the price, the clerk&rsquo;s record and exhibits are metered separately.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-semibold">Part of the record</span>
          <select aria-label="Part of the record" value={kind} onChange={(e) => setKind(e.target.value as VolumeKind)} className={field} data-testid="volume-kind" disabled={disabled || !!progress}>
            {(Object.keys(VOLUME_NAME) as VolumeKind[]).map((k) => (
              <option key={k} value={k}>{k === 'UNKNOWN' ? 'Not sure' : VOLUME_NAME[k]}</option>
            ))}
          </select>
        </label>
        {kind !== 'UNKNOWN' && (
          <span className="flex items-center gap-1 text-db-muted">
            vol.
            <input aria-label="Volume number" inputMode="numeric" value={index} onChange={(e) => setIndex(digits(e.target.value))} placeholder="–" className={`${field} w-12 text-center`} data-testid="volume-index" disabled={disabled || !!progress} />
            of
            <input aria-label="Number of volumes" inputMode="numeric" value={count} onChange={(e) => setCount(digits(e.target.value))} placeholder="–" className={`${field} w-12 text-center`} data-testid="volume-count" disabled={disabled || !!progress} />
          </span>
        )}
      </div>
      <div className="mt-3">
        <input ref={input} type="file" multiple accept=".pdf,.zip,application/pdf,application/zip" aria-label="Choose files" onChange={(e) => void handle(Array.from(e.target.files ?? []))} disabled={disabled || !!progress} data-testid="record-file-input" className="text-sm" />
      </div>
      {progress && (
        <div className="mt-3" aria-live="polite" data-testid="upload-progress">
          <p className="text-sm">Uploading {progress.name} ({progress.index} of {progress.total}) — {progress.pct}%</p>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--db-line)' }}>
            <div className="h-full rounded-full" style={{ background: 'var(--db-accent)', width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
      {done.length > 0 && !progress && <p className="mt-2 text-sm text-db-muted" role="status">Uploaded {done.length === 1 ? done[0] : `${done.length} files`}. The inventory below updates as each is read.</p>}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--db-urgent)' }} data-testid="upload-error">{error}</p>}
      {disabled && <p className="mt-2 text-sm text-db-muted">The record is closed for this matter: the review has started or the packet is out.</p>}
    </section>
  )
}
