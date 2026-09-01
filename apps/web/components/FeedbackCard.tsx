'use client'

/**
 * Feedback micro-survey (customer_feedback_program.md §2): one dismissible
 * card at the value moment. Touch 1 = clarity + recommend + decided-text;
 * ?survey=share (the +7d email link) shows touch 2 instead. The intro line
 * is the bias guard that licenses honesty after bad news.
 */
import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

export default function FeedbackCard({ caseId, variant }: { caseId: string; variant: 'report' | 'share' }) {
  const key = `snl_fb_${variant}_${caseId}`
  const [visible, setVisible] = useState(false)
  const [armed, setArmed] = useState(variant === 'share') // touch 2 shows immediately from the email link
  const [clarity, setClarity] = useState(0)
  const [recommend, setRecommend] = useState('')
  const [shared, setShared] = useState('')
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key)) return
    } catch {
      /* show anyway */
    }
    if (variant === 'share') {
      setVisible(true)
      return
    }
    // Touch 1 arms on dwell; the PDF click (a custom event) arms it sooner.
    const t = setTimeout(() => setArmed(true), 30_000)
    const onPdf = () => setArmed(true)
    window.addEventListener('snl:pdf-download', onPdf)
    return () => {
      clearTimeout(t)
      window.removeEventListener('snl:pdf-download', onPdf)
    }
  }, [key, variant])

  useEffect(() => {
    if (!armed) return
    try {
      if (window.localStorage.getItem(key)) return // dismissed forever
    } catch {
      /* show anyway */
    }
    setVisible(true)
  }, [armed, key])

  const dismiss = () => {
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      /* fine */
    }
    setVisible(false)
  }

  const submit = async () => {
    const body =
      variant === 'report'
        ? {
            ...(clarity ? { clarity } : {}),
            ...(recommend ? { recommend } : {}),
            ...(text ? { decidedText: text } : {}),
          }
        : {
            ...(shared ? { sharedWithLawyer: shared } : {}),
            ...(text ? { objectionText: text } : {}),
          }
    await apiFetch(`/cases/${caseId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {})
    setDone(true)
    try {
      window.localStorage.setItem(key, '1')
    } catch {
      /* fine */
    }
  }

  if (!visible) return null
  if (done)
    return (
      <div data-testid="feedback-done" className="mt-6 rounded-xl border border-db-line bg-db-surface p-4 text-sm text-db-muted">
        Thank you — every answer is read personally.
      </div>
    )

  return (
    <div data-testid="feedback-card" className="mt-6 rounded-xl border border-db-line bg-db-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-db-muted">
          However your report turned out, we want to know if we did our job well.
        </p>
        <button onClick={dismiss} aria-label="Dismiss" className="text-db-muted">
          ×
        </button>
      </div>

      {variant === 'report' ? (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-semibold">How well did this report explain what&rsquo;s in the record?</p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Clarity 1 to 5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={clarity === n}
                  onClick={() => setClarity(n)}
                  className={`h-11 w-11 rounded-lg border ${clarity === n ? 'border-db-accent bg-db-accent-soft font-bold' : 'border-db-line'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold">
              Would you tell another family in your situation to get this review?
            </p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ['yes', 'Yes'],
                  ['not_sure', 'Not sure'],
                  ['no', 'No'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setRecommend(v)}
                  className={`rounded-lg border px-4 py-2 text-sm ${recommend === v ? 'border-db-accent bg-db-accent-soft font-semibold' : 'border-db-line'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold">What did this report help you decide? (optional)</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-sm"
            />
          </label>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <p className="text-sm font-semibold">Have you shared your report with a lawyer yet?</p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ['yes', 'Yes'],
                  ['planning', 'Planning to'],
                  ['no', 'No'],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setShared(v)}
                  className={`rounded-lg border px-4 py-2 text-sm ${shared === v ? 'border-db-accent bg-db-accent-soft font-semibold' : 'border-db-line'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-semibold">
              Was there anything that almost stopped you from getting the review? (optional)
            </span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-db-line bg-db-surface p-3 text-sm"
            />
          </label>
        </div>
      )}

      <button
        onClick={() => void submit()}
        disabled={variant === 'report' ? !clarity && !recommend && !text : !shared && !text}
        className="mt-4 rounded-xl bg-db-accent px-5 py-2.5 font-semibold text-db-surface disabled:opacity-40"
      >
        Send
      </button>
    </div>
  )
}
