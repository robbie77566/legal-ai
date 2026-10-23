'use client'

/**
 * /counsel/matters/[caseId] — the matter page (persona_rollout_plan.md §5
 * C/D/E/F): the matter header; the TRAP clock; the record inventory and the
 * uploader while the record is open; "record complete" → the quote card
 * (counsel_checkout); the status line while the pipeline runs; the packet
 * download when READY/DELIVERED. Everything is read from the api on load
 * and after every action; nothing is computed here.
 *
 * The lawyer gate (UPL review 2026-10-23, P1 + P2): the api answers a
 * non-lawyer seat (investigator, viewer, or a lawyer whose bar number is
 * pending or rejected) a stripped matter — title, status, identifiers, the
 * checklist and the upload count, `lawyerSeat: false` — without the TRAP
 * clock, the lock list, the dates or the posture. This page then shows the
 * uploader and the inventory and one sentence in place of the lawyer cards.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { getInventory, getMatter, getQuote, recordsComplete, type MatterView } from '@/lib/api'
import { LAWYER_GATE_COPY, PACKET_STATUSES, QUOTABLE_STATUSES, RUNNING_STATUSES, professionalStatus, type LawyerSeatReason } from '@/lib/counsel'
import { useCounsel } from '@/components/counsel/CounselContext'
import TrapClockCard, { type TrapClockView } from '@/components/counsel/TrapClockCard'
import RecordInventoryCard, { type InventoryView } from '@/components/counsel/RecordInventoryCard'
import RecordUploader from '@/components/counsel/RecordUploader'
import QuoteCard, { type QuoteView } from '@/components/counsel/QuoteCard'
import PacketCard from '@/components/counsel/PacketCard'

interface MatterPage {
  /** Every field for a lawyer seat; identifiers only (no dates, no posture) for the rest. */
  matter: Partial<MatterView> & Pick<MatterView, 'id' | 'caseId' | 'vehicle' | 'vehicleLabel' | 'county' | 'clientInitials'>
  case: { id: string; title: string; status: string; expectedReadyAt?: string | null }
  trapClock?: TrapClockView
  checklist: { documents: number }
  locked?: string[]
  lawyerSeat: boolean
  lawyerSeatReason?: LawyerSeatReason
}

const DATE_LABEL: Array<[keyof Pick<MatterView, 'judgmentSignedAt' | 'sentenceImposedAt' | 'noticeOfAppealFiledAt' | 'recordFiledAt'>, string]> = [
  ['judgmentSignedAt', 'Judgment signed'],
  ['sentenceImposedAt', 'Sentence imposed'],
  ['noticeOfAppealFiledAt', 'Notice of appeal'],
  ['recordFiledAt', 'Record filed'],
]

export default function MatterPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const { flags } = useCounsel()
  const [data, setData] = useState<MatterPage | null>(null)
  const [inventory, setInventory] = useState<InventoryView | null>(null)
  const [quote, setQuote] = useState<QuoteView | null>(null)
  const [quoteNote, setQuoteNote] = useState('')
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [completing, setCompleting] = useState(false)

  const load = useCallback(async () => {
    const res = await getMatter(caseId)
    if (res.status === 404) {
      setNotFound(true)
      return
    }
    if (!res.ok) {
      setError('We could not load this matter just now. Refresh the page.')
      return
    }
    const page = (await res.json()) as MatterPage
    setData(page)
    const inv = await getInventory(caseId)
    if (inv.ok) setInventory((await inv.json()) as InventoryView)
    if (page.lawyerSeat && QUOTABLE_STATUSES.includes(page.case.status) && flags.counsel_checkout) {
      const q = await getQuote(caseId)
      if (q.ok) {
        setQuote((await q.json()) as QuoteView)
        setQuoteNote('')
      } else {
        setQuote(null)
        const body = (await q.json().catch(() => ({}))) as { error?: string }
        setQuoteNote(body.error === 'NOT_METERED' ? 'The page meter has not set a bucket yet — it runs as each volume finishes reading.' : '')
      }
    } else {
      setQuote(null)
    }
  }, [caseId, flags.counsel_checkout])

  useEffect(() => {
    void load()
  }, [load])

  // While the record is being read or the review runs, poll quietly.
  useEffect(() => {
    if (!data) return
    const status = data.case.status
    const reading = inventory?.volumes.some((v) => v.docs.some((d) => !d.digitised)) ?? false
    if (!RUNNING_STATUSES.includes(status) && !reading) return
    const t = setTimeout(() => void load(), 15_000)
    return () => clearTimeout(t)
  }, [data, inventory, load])

  const complete = async () => {
    setCompleting(true)
    setError('')
    try {
      const res = await recordsComplete(caseId)
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Could not close the record yet.')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close the record yet.')
    } finally {
      setCompleting(false)
    }
  }

  if (notFound) {
    return (
      <section className="py-10">
        <h1 className="font-db-serif text-2xl font-semibold">Matter not found</h1>
        <p className="mt-2 text-db-muted">It may belong to another organisation or have been deleted. <Link href="/counsel" className="underline">Back to matters</Link>.</p>
      </section>
    )
  }
  if (error && !data) return <p role="alert" className="py-10" style={{ color: 'var(--db-urgent)' }}>{error}</p>
  if (!data) return <p className="py-10 text-sm text-db-muted">Loading…</p>

  const { matter, case: kase } = data
  const status = kase.status
  const recordOpen = status === 'AWAITING_DOCS'
  const running = RUNNING_STATUSES.includes(status)
  const lawyer = data.lawyerSeat
  const packet = lawyer && PACKET_STATUSES.includes(status)
  const hasDocs = data.checklist.documents > 0

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-db-muted"><Link href="/counsel" className="underline">Matters</Link> · {matter.clientInitials}</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-db-serif text-3xl font-semibold" data-testid="matter-title">{kase.title}</h1>
          <span className="rounded-full bg-db-accent-soft px-3 py-1 text-sm font-semibold" data-testid="matter-status">{professionalStatus(status)}</span>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3" data-testid="matter-header">
          <div><dt className="inline text-db-muted">Vehicle: </dt><dd className="inline">{matter.vehicleLabel}</dd></div>
          <div><dt className="inline text-db-muted">County: </dt><dd className="inline">{matter.county}</dd></div>
          {matter.court && <div><dt className="inline text-db-muted">Court: </dt><dd className="inline">{matter.court}</dd></div>}
          {matter.causeNumber && <div><dt className="inline text-db-muted">Cause no.: </dt><dd className="inline font-db-mono">{matter.causeNumber}</dd></div>}
          {matter.offence && <div><dt className="inline text-db-muted">Offence: </dt><dd className="inline">{matter.offence}</dd></div>}
          {matter.sentence && <div><dt className="inline text-db-muted">Sentence: </dt><dd className="inline">{matter.sentence}</dd></div>}
          {matter.lane && <div><dt className="inline text-db-muted">Lane: </dt><dd className="inline">{matter.lane === 'PLEA' ? 'Plea' : 'Trial'}</dd></div>}
          {(matter.subsequentWrit || (matter.priorWrits ?? 0) > 0) && <div><dt className="inline text-db-muted">Posture: </dt><dd className="inline">Subsequent application (§4){(matter.priorWrits ?? 0) > 0 ? ` · ${matter.priorWrits} prior` : ''}</dd></div>}
          {DATE_LABEL.map(([k, l]) => matter[k] && (
            <div key={k}><dt className="inline text-db-muted">{l}: </dt><dd className="inline font-db-mono">{matter[k]}</dd></div>
          ))}
        </dl>
        {matter.outsideRecordNote && <p className="mt-2 text-sm text-db-muted">Outside the record: {matter.outsideRecordNote}</p>}
      </div>

      {error && <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--db-urgent)', color: 'var(--db-urgent)' }}>{error}</p>}

      {!lawyer && (
        <section data-testid="lawyer-gate-matter" className="rounded-xl border border-db-line bg-db-accent-soft p-5">
          <h2 className="font-db-serif text-xl font-semibold">For the organisation&rsquo;s attorneys</h2>
          <p className="mt-1 text-[15px]">{LAWYER_GATE_COPY[data.lawyerSeatReason ?? 'LAWYER_SEAT_REQUIRED']}</p>
        </section>
      )}

      {packet && <PacketCard caseId={caseId} title={kase.title} />}

      {running && (
        <section data-testid="matter-running" className="rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold">{professionalStatus(status)}</h2>
          <p className="mt-1 text-[15px] text-db-muted">
            The record is being read and screened. We email when the packet is ready{kase.expectedReadyAt ? `, expected by ${kase.expectedReadyAt.slice(0, 10)}` : ''}. Nothing more is needed from you.
          </p>
        </section>
      )}

      {quote && <QuoteCard quote={quote} onSettled={load} />}
      {lawyer && QUOTABLE_STATUSES.includes(status) && !quote && (
        <section data-testid="quote-pending" className="rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold">Quote</h2>
          <p className="mt-1 text-[15px] text-db-muted">
            {!flags.counsel_checkout ? 'Pricing is not open for your organisation yet; we will email when it is.' : quoteNote || 'The record is metered and priced here before anything runs.'}
          </p>
        </section>
      )}

      {lawyer && data.trapClock && <TrapClockCard clock={data.trapClock} />}

      {(recordOpen || status === 'DOCS_COMPLETE' || status === 'QUOTED') && (
        <RecordUploader caseId={caseId} disabled={!recordOpen} onUploaded={load} />
      )}

      {inventory && <RecordInventoryCard inventory={inventory} />}

      {lawyer && recordOpen && (
        <section data-testid="records-complete" className="rounded-xl border border-db-line bg-db-surface p-5">
          <h2 className="font-db-serif text-xl font-semibold">Close the record</h2>
          <p className="mt-1 text-[15px] text-db-muted">
            When every volume is here, close the record. The page meter sets the rung and the quote appears; nothing is charged and nothing runs until you accept it.
          </p>
          <button type="button" onClick={() => void complete()} disabled={!hasDocs || completing} className="mt-4 rounded-xl bg-db-accent px-5 py-3 font-semibold text-db-surface disabled:opacity-40" data-testid="records-complete-button">
            {completing ? 'Closing…' : 'The record is complete'}
          </button>
          {!hasDocs && <p className="mt-2 text-xs text-db-muted">Upload at least one volume first.</p>}
        </section>
      )}
    </section>
  )
}
