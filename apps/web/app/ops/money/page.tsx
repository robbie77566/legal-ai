'use client'

/**
 * Money (payments_and_refunds spec §3) — Industrial Authority. Six numbers,
 * then what needs a decision, then the ledger. One refund dialog for every
 * entry point (ledger row, case drawer via ?case=, a Support request).
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, opsCreateInvoice, opsListCredits, opsListInvoices, opsListOrganisations, opsMarkInvoicePaid } from '@/lib/api'

interface PaymentRow {
  id: string
  stripeId: string
  paymentIntentId: string | null
  caseId: string | null
  caseTitle: string | null
  customerEmail: string | null
  kind: 'REVIEW' | 'OVERAGE' | 'RERUN' | 'REFUND'
  status: 'PENDING' | 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED'
  amountCents: number
  refundedCents: number
  remainingCents: number
  promoCode: string | null
  sku?: string | null
  rung?: string | null
  free: boolean
  disputeStatus: string | null
  disputedAt: string | null
  refundedAt: string | null
  createdAt: string
}
interface RefundRow {
  id: string
  caseTitle: string | null
  customerEmail: string | null
  amountCents: number
  partial: boolean
  reason: string
  issuedByEmail: string
  createdAt: string
}
interface Spend {
  weeks: number; from: string; totalUsd: number; cases: number; perCaseUsd: number | null
  rows: Array<{ weekOf: string; cases: number; modelUsd: number; ocrUsd: number; otherUsd: number; totalUsd: number; perCaseUsd: number | null; byProvider: Record<string, number> }>
}
interface Summary {
  stripe: 'unset' | 'test' | 'live'
  period: { days: number; from: string }
  testMode?: { included: boolean; hiddenCount: number }
  totals: {
    sold: number; freeCount: number; collectedCents: number; refundedCents: number; netCents: number
    refundRate: number | null; refundCount: number; partialCount: number
    costUsd: number; costPerCaseUsd: number | null; marginPct: number | null; needsDecision: number
  }
  weeks: Array<{ weekOf: string; sold: number; collectedCents: number; refundedCents: number; netCents: number; costUsd: number }>
  // Professional era (staff_console.md §12): money by counsel rung; family rows carry no SKU.
  byRung?: Record<string, { count: number; cents: number; refundedCents: number }>
  disputes: PaymentRow[]
  requests: Array<{ id: string; caseId: string; caseTitle: string; type: 'REFUND' | 'CASE_DELETE' | 'ACCOUNT_DELETE'; reason: string; note: string | null; amountCents: number | null; requestedByEmail: string; createdAt: string }>
  recentRefunds: RefundRow[]
  reconciliation: { checked: number; healed: number; ranAt: string; trigger: string } | null
}

interface InvoiceRow {
  id: string; number: string; status: 'DRAFT' | 'SENT' | 'PAID' | 'VOID'; totalCents: number
  lines: Array<{ caseId: string; causeNumber?: string; sku: string; cents: number }>
  paidAt: string | null; paidBy: string | null; achReference: string | null; createdAt: string
  organisation: { id: string; name: string; kind: string; isTest: boolean } | null
}
interface CreditSummary {
  issued: number; consumed: number; expired: number; live: number
  rows: Array<{ id: string; packId: string; rung: string; state: 'LIVE' | 'CONSUMED' | 'EXPIRED'; issuedAt: string; expiresAt: string; consumedAt: string | null; consumedCaseId: string | null; organisation: { id: string; name: string } | null; buyer: { email: string; name: string | null } | null }>
}
interface OrgOption { id: string; name: string; kind: string; isTest: boolean }
interface QueueCase { id: string; label: string; ref: string; status: string; organisation: { id: string } | null; matter: { vehicle: string; causeNumber: string | null } | null }

/** The counsel ladder in the order the tiles read; packs and anything else sold appear after. */
const RUNG_TILES: Array<[string, string]> = [['COUNSEL_SHORT', 'Counsel · Short'], ['COUNSEL_STANDARD', 'Counsel · Standard'], ['COUNSEL_EXTENDED', 'Counsel · Extended'], ['COUNSEL_LONG', 'Counsel · Long']]
const skuLabel = (sku: string) => RUNG_TILES.find(([k]) => k === sku)?.[1] ?? sku.replace(/_/g, ' · ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())

const REASONS: Array<[string, string]> = [
  ['unreadable_record', 'Unreadable record'],
  ['customer_request', 'Customer request'],
  ['chargeback', 'Chargeback settled'],
  ['other', 'Other'],
]
const PERIODS: Array<[number, string]> = [[7, 'This week'], [30, '30 days'], [90, 'Quarter'], [3650, 'All time']]
const FILTERS: Array<[string, string]> = [['', 'All'], ['succeeded', 'Succeeded'], ['refunded', 'Refunded'], ['partial', 'Partial'], ['disputed', 'Disputed'], ['free', 'Free']]

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const usdFloat = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number | null) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function Tile({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'warn' | 'ok' | 'bad' }) {
  const color = tone === 'bad' ? '#F85149' : tone === 'warn' ? '#D29922' : tone === 'ok' ? '#3FB950' : '#E6EDF3'
  return (
    <div className={`rounded border bg-[#0D1117] p-3 ${tone === 'bad' ? 'border-[#F85149]' : 'border-[#30363D]'}`} data-testid={`tile-${label.toLowerCase().replace(/\W+/g, '-')}`}>
      <div className="text-[11px] uppercase tracking-wider text-[#8B949E]">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-1 text-xs text-[#8B949E]">{hint}</div>
    </div>
  )
}

function StatusChip({ p }: { p: PaymentRow }) {
  if (p.disputeStatus === 'open') return <span className="rounded bg-[#F85149] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#0B0E14]">DISPUTED</span>
  if (p.status === 'REFUNDED') return <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#8B949E]">REFUNDED</span>
  if (p.status === 'PARTIALLY_REFUNDED') return <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#D29922]">PARTIAL · {usd(p.refundedCents)} back</span>
  return (
    <span className="inline-flex gap-1">
      <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#3FB950]">{p.status}</span>
      {p.free && <span className="rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[#8B949E]">FREE</span>}
    </span>
  )
}

function RefundDialog({ payment, onClose, onDone }: { payment: PaymentRow; onClose: () => void; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const cents = mode === 'full' ? payment.remainingCents : Math.round(Number(amount) * 100)
  const valid = !!reason && cents > 0 && cents <= payment.remainingCents

  const submit = async () => {
    setBusy(true); setError('')
    const res = await apiFetch(`/ops/payments/${payment.id}/refund`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, ...(mode === 'partial' ? { amountCents: cents } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body.error ?? `Refund failed (${res.status})`); return }
    onDone(`Refunded ${usd(body.amountCents)}${body.caseTransitioned ? ' — case moved to Refunded.' : '.'}`)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Refund" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" data-testid="refund-dialog">
      <div className="w-full max-w-2xl rounded border border-[#30363D] bg-[#161B22]">
        <div className="border-b border-[#30363D] px-5 py-4">
          <h2 className="font-serif text-lg font-bold">Refund — {payment.caseTitle ?? payment.kind}</h2>
          <p className="mt-1 text-xs text-[#8B949E]">
            {usd(payment.amountCents)} paid {when(payment.createdAt)} · {payment.customerEmail ?? 'unknown customer'} · {payment.kind.toLowerCase()}
            {payment.refundedCents > 0 && <> · {usd(payment.refundedCents)} already refunded</>}
          </p>
        </div>

        <div className="space-y-5 px-5 py-4">
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-[#8B949E]">How much</legend>
            <label className={`mt-2 flex cursor-pointer items-start gap-3 rounded border p-3 ${mode === 'full' ? 'border-[#D4AF37]' : 'border-[#30363D]'} bg-[#0D1117]`}>
              <input type="radio" name="mode" checked={mode === 'full'} onChange={() => setMode('full')} className="mt-1" />
              <span><span className="font-semibold">Full refund — {usd(payment.remainingCents)}</span>
                <span className="block text-xs text-[#8B949E]">{payment.kind === 'REVIEW' ? 'Moves the case to Refunded and stops any work in progress.' : 'The case is not affected.'}</span></span>
            </label>
            <label className={`mt-2 flex cursor-pointer items-start gap-3 rounded border p-3 ${mode === 'partial' ? 'border-[#D4AF37]' : 'border-[#30363D]'} bg-[#0D1117]`}>
              <input type="radio" name="mode" checked={mode === 'partial'} onChange={() => setMode('partial')} className="mt-1" />
              <span className="flex-1"><span className="font-semibold">Partial refund</span>
                <span className="mt-2 flex items-center gap-2">
                  <span className="text-sm text-[#8B949E]">$</span>
                  <input aria-label="Partial amount" value={amount} onChange={(e) => { setAmount(e.target.value); setMode('partial') }} type="number" min="0.01" step="0.01" max={payment.remainingCents / 100} className="w-32 rounded border border-[#30363D] bg-[#161B22] p-1.5 font-mono text-sm" />
                  <span className="text-xs text-[#8B949E]">up to {usd(payment.remainingCents)} · the case stays where it is</span>
                </span></span>
            </label>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wider text-[#8B949E]">Why</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {REASONS.map(([value, label]) => (
                <label key={value} className={`flex cursor-pointer items-center gap-3 rounded border p-3 ${reason === value ? 'border-[#D4AF37]' : 'border-[#30363D]'} bg-[#0D1117]`}>
                  <input type="radio" name="reason" value={value} checked={reason === value} onChange={() => setReason(value)} />
                  <span className="font-semibold">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block text-[11px] uppercase tracking-wider text-[#8B949E]">
            Note for the record
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-2 block w-full rounded border border-[#30363D] bg-[#161B22] p-2 text-sm normal-case tracking-normal text-[#E6EDF3]" />
          </label>

          <div className="rounded border border-[#D29922] bg-[#0D1117] px-3 py-2 text-xs">
            <span className="font-semibold text-[#D29922]">This cannot be undone. </span>
            <span className="text-[#8B949E]">{valid ? usd(cents) : 'The amount'} goes back to the customer&apos;s card in 5–10 business days through Stripe; Stripe&apos;s processing fee is not returned to us. The refund is recorded in the ledger and the case timeline under your name.</span>
          </div>
          {error && <p className="text-sm text-[#F85149]">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#30363D] px-5 py-3">
          <button onClick={onClose} className="rounded border border-[#30363D] px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={() => void submit()} disabled={!valid || busy} data-testid="refund-confirm" className="rounded bg-[#F85149] px-3 py-1.5 text-sm font-semibold text-[#0B0E14] disabled:opacity-40">
            {valid ? `Refund ${usd(cents)}` : 'Refund'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MoneyPage() {
  const [days, setDays] = useState(30)
  const [showTest, setShowTest] = useState(false)
  const [purgeTyped, setPurgeTyped] = useState('')
  const [purging, setPurging] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [spend, setSpend] = useState<Spend | null>(null)
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [payments, setPayments] = useState<{ total: number; rows: PaymentRow[] }>({ total: 0, rows: [] })
  const [target, setTarget] = useState<PaymentRow | null>(null)
  const [notice, setNotice] = useState('')
  const [reconciling, setReconciling] = useState(false)
  const [autoOpenCase, setAutoOpenCase] = useState<string | null>(null)
  const [declining, setDeclining] = useState<{ id: string; note: string } | null>(null)
  // Professional era: ACH invoices and prepaid credits beside the family ledger.
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [credits, setCredits] = useState<CreditSummary | null>(null)
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [queueCases, setQueueCases] = useState<QueueCase[]>([])
  const [draftOrg, setDraftOrg] = useState('')
  const [draftCases, setDraftCases] = useState<string[]>([])
  const [paying, setPaying] = useState<{ id: string; ref: string } | null>(null)

  const loadProfessional = useCallback(async () => {
    const [i, c] = await Promise.all([opsListInvoices(), opsListCredits()])
    if (i.ok) { const d = await i.json().catch(() => null); setInvoices(Array.isArray(d) ? (d as InvoiceRow[]) : []) }
    if (c.ok) { const d = (await c.json().catch(() => null)) as CreditSummary | null; setCredits(d && Array.isArray(d.rows) ? d : null) }
  }, [])
  useEffect(() => { void loadProfessional() }, [loadProfessional])
  useEffect(() => {
    void opsListOrganisations().then(async (r) => { if (!r.ok) return; const d = (await r.json().catch(() => null)) as { organisations?: OrgOption[] } | null; setOrgs(Array.isArray(d?.organisations) ? d!.organisations! : []) })
    void apiFetch('/ops/queue').then(async (r) => { if (!r.ok) return; const d = await r.json().catch(() => null); setQueueCases(Array.isArray(d) ? (d as QueueCase[]) : []) })
  }, [])

  const createDraft = async () => {
    if (!draftOrg || draftCases.length === 0) return
    const r = await opsCreateInvoice({ organisationId: draftOrg, caseIds: draftCases })
    const d = await r.json().catch(() => ({}))
    setNotice(r.ok ? `Draft ${d.number} created for ${usd(d.totalCents)} — ${d.lines?.length ?? 0} line(s).` : d.error ?? `Could not draft (${r.status})`)
    if (r.ok) { setDraftCases([]); await loadProfessional() }
  }
  const markPaid = async () => {
    if (!paying?.ref.trim()) return
    const r = await opsMarkInvoicePaid(paying.id, paying.ref.trim())
    const d = await r.json().catch(() => ({}))
    setNotice(r.ok ? `${d.number} marked paid (${d.achReference}).` : d.error ?? `Could not mark paid (${r.status})`)
    setPaying(null)
    if (r.ok) await loadProfessional()
  }
  const draftable = queueCases.filter((c) => draftOrg && c.organisation?.id === draftOrg && c.status !== 'DELETED')

  const decide = async (id: string, decision: 'APPROVED' | 'DECLINED', decisionNote?: string) => {
    const res = await apiFetch(`/ops/requests/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, ...(decisionNote ? { decisionNote } : {}) }) })
    const d = await res.json().catch(() => ({}))
    setNotice(res.ok ? (decision === 'APPROVED' ? `Approved — refunded ${d.result?.amountCents != null ? usd(d.result.amountCents) : ''} under your name.` : 'Declined; the requester can see why.') : d.error ?? `Decision failed (${res.status})`)
    setDeclining(null)
    await Promise.all([loadSummary(), loadPayments()])
  }

  const loadSummary = useCallback(async () => {
    void apiFetch('/ops/costs?weeks=12').then(async (c) => { if (c.ok) setSpend(await c.json()) })
    const r = await apiFetch(`/ops/payments/summary?days=${days}${showTest ? '&includeTest=1' : ''}`)
    if (r.ok) setSummary(await r.json())
  }, [days, showTest])
  const loadPayments = useCallback(async () => {
    const params = new URLSearchParams()
    if (filter) params.set('status', filter)
    if (term) params.set('q', term)
    if (showTest) params.set('includeTest', '1')
    const r = await apiFetch(`/ops/payments${params.size ? `?${params}` : ''}`)
    if (r.ok) setPayments(await r.json())
  }, [filter, term, showTest])
  useEffect(() => { void loadSummary() }, [loadSummary])
  useEffect(() => { void loadPayments() }, [loadPayments])

  // Arrived from the case drawer's Refund… link: open the dialog on that
  // case's refundable review payment once the ledger is in.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('case')
    if (c) setAutoOpenCase(c)
  }, [])
  useEffect(() => {
    if (!autoOpenCase || !payments.rows.length) return
    const p = payments.rows.find((r) => r.caseId === autoOpenCase && r.kind === 'REVIEW' && r.remainingCents > 0 && !r.free)
    if (p) setTarget(p)
    else setNotice('That case has no refundable payment.')
    setAutoOpenCase(null)
  }, [autoOpenCase, payments])

  const reconcile = async () => {
    setReconciling(true)
    const r = await apiFetch('/ops/reconcile-payments', { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    setReconciling(false)
    setNotice(r.ok ? `Checked ${d.checked} Stripe session(s), healed ${d.healed}.${d.healed > 0 ? ' A healed payment means a webhook was missed — check Health.' : ''}` : d.error ?? 'Reconciliation failed.')
    await Promise.all([loadSummary(), loadPayments()])
  }

  const done = async (msg: string) => {
    setTarget(null); setNotice(msg)
    await Promise.all([loadSummary(), loadPayments()])
  }

  const t = summary?.totals
  const stripeTone = summary?.stripe === 'live' ? 'text-[#3FB950]' : summary?.stripe === 'test' ? 'text-[#D29922]' : 'text-[#F85149]'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Money</h1>
          {summary && <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${stripeTone}`} data-testid="stripe-mode">STRIPE {summary.stripe.toUpperCase()}</span>}
          {summary?.reconciliation && (
            <span className="text-xs text-[#8B949E]">
              Last reconciliation {when(summary.reconciliation.ranAt)} · checked {summary.reconciliation.checked}, healed {summary.reconciliation.healed}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-[#30363D] bg-[#0D1117] p-0.5 text-xs" data-testid="period">
            {PERIODS.map(([d, label]) => (
              <button key={d} onClick={() => setDays(d)} className={`rounded px-2.5 py-1 ${days === d ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => void reconcile()} disabled={reconciling} className="rounded border border-[#30363D] px-3 py-1.5 text-xs disabled:opacity-40" data-testid="reconcile-now">
            {reconciling ? 'Reconciling…' : 'Reconcile with Stripe now'}
          </button>
        </div>
      </div>
      {notice && <p className="mt-2 text-sm text-[#D29922]" data-testid="notice">{notice}</p>}

      {/* Stripe test-mode rows (cs_test_…) are not money. Hidden by default;
          shown on request; purgeable by an admin (2026-09-11). */}
      {summary && (showTest || (summary.testMode?.hiddenCount ?? 0) > 0) && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-[#D29922]/60 bg-[#0D1117] px-3 py-2 text-xs" data-testid="test-mode-bar">
          <span className="text-[#D29922]">
            {showTest ? 'Showing Stripe test-mode payments (not real money).' : `${summary.testMode?.hiddenCount} Stripe test-mode payment${summary.testMode?.hiddenCount === 1 ? '' : 's'} hidden from every number on this page.`}
          </span>
          <button onClick={() => setShowTest((v) => !v)} className="rounded border border-[#30363D] px-2 py-1" data-testid="toggle-test">{showTest ? 'Hide test-mode' : 'Show test-mode'}</button>
          <span className="ml-auto flex items-center gap-2">
            <input value={purgeTyped} onChange={(e) => setPurgeTyped(e.target.value)} placeholder="type PURGE TEST" aria-label="Purge confirmation" className="w-36 rounded border border-[#30363D] bg-[#161B22] p-1 font-mono" />
            <button
              disabled={purgeTyped !== 'PURGE TEST' || purging}
              onClick={async () => {
                setPurging(true)
                try {
                  const r = await apiFetch('/ops/payments/purge-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: purgeTyped }) })
                  const d = await r.json().catch(() => ({}))
                  setNotice(r.ok ? `Purged ${d.payments} test-mode payment(s) (${usd(d.amountCents ?? 0)}) and ${d.refunds} refund row(s). Live and promo rows untouched.` : d.error ?? `Purge failed (${r.status})`)
                  setPurgeTyped('')
                  await Promise.all([loadSummary(), loadPayments()])
                } finally { setPurging(false) }
              }}
              className="rounded border border-[#F85149] px-2 py-1 text-[#F85149] disabled:opacity-40"
              data-testid="purge-test"
            >
              Purge test-mode payments
            </button>
          </span>
        </div>
      )}

      {t && (
        <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Collected" value={usd(t.collectedCents)} hint={`${t.sold} sold · ${t.freeCount} free with promo`} />
          <Tile label="Refunded" value={usd(t.refundedCents)} hint={`${t.refundCount} refund(s) on this period's sales · ${t.partialCount} partial`} tone={t.refundedCents > 0 ? 'warn' : undefined} />
          <Tile label="Net" value={usd(t.netCents)} hint="after refunds, before Stripe fees" tone="ok" />
          <Tile label="Refund rate" value={pct(t.refundRate)} hint="of what was sold in the period · reserve policy 5%" tone={t.refundRate != null && t.refundRate > 0.05 ? 'bad' : undefined} />
          <Tile label="Cost of reviews" value={usdFloat(t.costUsd)} hint={`${t.costPerCaseUsd != null ? `${usdFloat(t.costPerCaseUsd)} per case` : 'no cases'} · ${t.marginPct != null ? `${(t.marginPct * 100).toFixed(0)}% margin` : 'margin —'}`} />
          <Tile label="Needs a decision" value={String(t.needsDecision)} hint={t.needsDecision ? `${summary!.disputes.length} dispute(s) · ${summary!.requests.length} request(s)` : 'nothing waiting'} tone={t.needsDecision ? 'bad' : undefined} />
        </div>
      )}

      {/* Professional era (staff_console.md §12): the same period, by counsel rung. Test organisations are excluded. */}
      {summary?.byRung && (
        <section className="mt-5" data-testid="by-rung">
          <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">By rung · counsel</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            {[...RUNG_TILES, ...Object.keys(summary.byRung).filter((k) => !RUNG_TILES.some(([r]) => r === k) && summary.byRung![k].count > 0).map((k): [string, string] => [k, skuLabel(k)])].map(([sku, label]) => {
              const r = summary.byRung![sku] ?? { count: 0, cents: 0, refundedCents: 0 }
              return <Tile key={sku} label={label} value={usd(r.cents)} hint={`${r.count} sold${r.refundedCents ? ` · ${usd(r.refundedCents)} refunded` : ''}`} tone={r.count ? 'ok' : undefined} />
            })}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section>
          <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">By week</h2>
          <table className="mt-2 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                <th className="py-2">Week of</th><th className="text-right">Sold</th><th className="text-right">Collected</th><th className="text-right">Refunded</th><th className="text-right">Net</th><th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {summary?.weeks.map((w) => (
                <tr key={w.weekOf} className="border-b border-[#21262D] font-mono tabular-nums">
                  <td className="py-2 font-sans">{day(w.weekOf)}</td>
                  <td className="text-right">{w.sold}</td>
                  <td className="text-right">{usd(w.collectedCents)}</td>
                  <td className={`text-right ${w.refundedCents ? 'text-[#D29922]' : 'text-[#8B949E]'}`}>{w.refundedCents ? usd(w.refundedCents) : '—'}</td>
                  <td className="text-right">{usd(w.netCents)}</td>
                  <td className="text-right">{usdFloat(w.costUsd)}</td>
                </tr>
              ))}
              {summary && summary.weeks.length === 0 && <tr><td colSpan={6} className="py-3 text-sm text-[#8B949E]">No payments in this period.</td></tr>}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-[#8B949E]">Cost here is charged to the week the case was <em>sold</em> (the reserve-policy view).</p>

          <h2 className="mt-6 text-[11px] uppercase tracking-wider text-[#8B949E]">Spend by week, as incurred{spend ? ` · last ${spend.weeks} weeks: ${usdFloat(spend.totalUsd)} across ${spend.cases} case${spend.cases === 1 ? '' : 's'}` : ''}</h2>
          <table className="mt-2 w-full border-collapse text-sm" data-testid="spend-by-week">
            <thead>
              <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
                <th className="py-2">Week of</th><th className="text-right">Cases worked</th><th className="text-right">Model</th><th className="text-right">OCR</th><th className="text-right">Other</th><th className="text-right">Total</th><th className="text-right">Per case</th>
              </tr>
            </thead>
            <tbody>
              {spend?.rows.map((w) => (
                <tr key={w.weekOf} className="border-b border-[#21262D] font-mono tabular-nums" title={Object.entries(w.byProvider).map(([k, v]) => `${k}: ${usdFloat(v)}`).join(' · ')}>
                  <td className="py-2 font-sans">{day(w.weekOf)}</td>
                  <td className="text-right">{w.cases}</td>
                  <td className="text-right">{usdFloat(w.modelUsd)}</td>
                  <td className="text-right">{w.ocrUsd ? usdFloat(w.ocrUsd) : '—'}</td>
                  <td className="text-right">{w.otherUsd ? usdFloat(w.otherUsd) : '—'}</td>
                  <td className="text-right font-semibold">{usdFloat(w.totalUsd)}</td>
                  <td className="text-right">{w.perCaseUsd != null ? usdFloat(w.perCaseUsd) : '—'}</td>
                </tr>
              ))}
              {spend && spend.rows.length === 0 && <tr><td colSpan={7} className="py-3 text-sm text-[#8B949E]">No model or OCR spend recorded in this period.</td></tr>}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-[#8B949E]">Charged to the week the work ran (model calls, OCR pages). Hover a row for the split by model. Dollars are estimates from env rates; tokens and pages are the ground truth (per case: the case file&rsquo;s COGS).</p>
        </section>

        <aside>
          <h2 className="text-[11px] uppercase tracking-wider text-[#F85149]">Needs a decision</h2>
          <div className="mt-2 rounded border border-[#30363D] bg-[#161B22]" data-testid="needs-decision">
            {summary?.requests.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-[#21262D] p-3 last:border-b-0" data-testid={`request-${r.id}`}>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.type === 'REFUND' ? 'Refund request' : r.type === 'CASE_DELETE' ? 'Case deletion request' : 'Account deletion request'} — {r.caseTitle}{r.amountCents ? ` · ${usd(r.amountCents)}` : ''}</div>
                  <div className="text-xs text-[#8B949E]">{r.requestedByEmail} · {r.reason.replace(/_/g, ' ')}{r.note ? ` · “${r.note}”` : ''} · {when(r.createdAt)}</div>
                  {declining?.id === r.id && (
                    <div className="mt-2 flex gap-2">
                      <input value={declining.note} onChange={(e) => setDeclining({ id: r.id, note: e.target.value })} placeholder="Say why — the requester reads this" aria-label="Decline reason" className="flex-1 rounded border border-[#30363D] bg-[#0D1117] p-1.5 text-xs" />
                      <button onClick={() => void decide(r.id, 'DECLINED', declining.note)} disabled={!declining.note.trim()} className="rounded border border-[#30363D] px-2 py-1 text-xs disabled:opacity-40">Decline</button>
                    </div>
                  )}
                </div>
                {declining?.id !== r.id && (
                  <>
                    <button onClick={() => setDeclining({ id: r.id, note: '' })} className="rounded border border-[#30363D] px-2 py-1 text-xs">Decline…</button>
                    <button onClick={() => { if (window.confirm(`Approve this ${r.type === 'REFUND' ? 'refund' : 'deletion'}? It runs now, under your name.`)) void decide(r.id, 'APPROVED') }} className="rounded border border-[#D29922] px-2 py-1 text-xs text-[#D29922]" data-testid={`approve-${r.id}`}>Approve</button>
                  </>
                )}
              </div>
            ))}
            {summary?.disputes.length ? summary.disputes.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b border-[#21262D] p-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Dispute — {p.caseTitle ?? p.kind} · {usd(p.amountCents)}</div>
                  <div className="text-xs text-[#8B949E]">Opened {p.disputedAt ? when(p.disputedAt) : '—'} · {p.customerEmail} · Stripe holds the funds until it closes</div>
                </div>
                {p.caseId && (
                  <button onClick={() => void apiFetch(`/ops/cases/${p.caseId}/disclosure-archive`).then(async (r) => { const d = await r.json().catch(() => ({})); setNotice(r.ok ? `Evidence: ${d.acknowledgments?.length ?? 0} disclosure acknowledgment(s) — copied to the console.` : d.error ?? 'export failed'); if (r.ok) console.log('E-6 disclosure archive', d) })} className="rounded bg-[#D4AF37] px-2 py-1 text-xs font-semibold text-[#0B0E14]">Assemble evidence</button>
                )}
              </div>
            )) : !summary?.requests.length ? <p className="p-3 text-sm text-[#8B949E]">Nothing is waiting on you — no open disputes, no requests from support.</p> : null}
          </div>

          <h2 className="mt-5 text-[11px] uppercase tracking-wider text-[#8B949E]">Recent refunds</h2>
          <div className="mt-2 rounded border border-[#30363D] bg-[#161B22] text-xs" data-testid="recent-refunds">
            {summary?.recentRefunds.length ? summary.recentRefunds.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-[#21262D] px-3 py-2 last:border-b-0">
                <span className="w-14 shrink-0 font-mono text-[#8B949E]">{new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                <span className="min-w-0 flex-1 truncate">{r.caseTitle ?? r.customerEmail ?? '—'} · <span className={r.partial ? 'text-[#D29922]' : ''}>{usd(r.amountCents)}{r.partial ? ' partial' : ''}</span> · {r.reason.replace(/_/g, ' ')}</span>
                <span className="shrink-0 text-[#8B949E]">{r.issuedByEmail.split('@')[0]}</span>
              </div>
            )) : <p className="p-3 text-[#8B949E]">No refunds yet.</p>}
          </div>
        </aside>
      </div>

      {/* ACH invoices for offices and clinics (persona plan §4; staff_console.md §11 B). The PDF statement is the February slice. */}
      <section className="mt-8" data-testid="invoices">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Invoices · ACH</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="invoice-draft">
            <select aria-label="Organisation to invoice" value={draftOrg} onChange={(e) => { setDraftOrg(e.target.value); setDraftCases([]) }} className="rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs">
              <option value="">Draft an invoice for…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isTest ? ' (test)' : ''}</option>)}
            </select>
            {draftOrg && (
              <span className="flex flex-wrap items-center gap-2 rounded border border-[#30363D] bg-[#0D1117] px-2 py-1">
                {draftable.length === 0 && <span className="text-[#8B949E]">no counsel cases on this organisation</span>}
                {draftable.map((c) => (
                  <label key={c.id} className="flex items-center gap-1">
                    <input type="checkbox" checked={draftCases.includes(c.id)} onChange={(e) => setDraftCases((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)))} />
                    <span className="font-mono">{c.matter?.causeNumber ?? c.ref}</span><span className="text-[#8B949E]">{c.matter?.vehicle ? ` ${c.matter.vehicle}` : ''}</span>
                  </label>
                ))}
                <button onClick={() => void createDraft()} disabled={draftCases.length === 0} className="rounded bg-[#D4AF37] px-2 py-1 font-semibold text-[#0B0E14] disabled:opacity-40" data-testid="invoice-create">Create DRAFT ({draftCases.length})</button>
              </span>
            )}
          </div>
        </div>
        <table className="mt-3 w-full border-collapse text-sm" data-testid="invoices-table">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2">Number</th><th>Organisation</th><th>Status</th><th>Lines</th><th className="text-right">Total</th><th>Paid</th><th></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-[#21262D] align-top" data-testid={`invoice-${inv.id}`}>
                <td className="py-2 font-mono">{inv.number}</td>
                <td className="text-xs">{inv.organisation ? <Link href={`/ops/organisations/${inv.organisation.id}`} className="underline hover:text-[#D4AF37]">{inv.organisation.name}</Link> : '—'}</td>
                <td><span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${inv.status === 'PAID' ? 'text-[#3FB950]' : inv.status === 'VOID' ? 'text-[#8B949E]' : 'text-[#D29922]'}`}>{inv.status}</span></td>
                <td className="font-mono text-[11px] text-[#8B949E]">{inv.lines.map((l) => `${l.causeNumber ?? l.caseId.slice(-6)} · ${l.sku.replace('COUNSEL_', '').toLowerCase()} · ${usd(l.cents)}`).join(' / ')}</td>
                <td className="text-right font-mono tabular-nums">{usd(inv.totalCents)}</td>
                <td className="font-mono text-xs text-[#8B949E]">{inv.paidAt ? `${when(inv.paidAt)} · ${inv.achReference}` : '—'}</td>
                <td className="text-right text-xs">
                  {(inv.status === 'DRAFT' || inv.status === 'SENT') && (
                    paying?.id === inv.id ? (
                      <span className="flex items-center justify-end gap-1">
                        <input aria-label="ACH reference" value={paying.ref} onChange={(e) => setPaying({ id: inv.id, ref: e.target.value })} placeholder="ACH reference" className="w-36 rounded border border-[#30363D] bg-[#161B22] p-1 font-mono text-xs" />
                        <button onClick={() => void markPaid()} disabled={!paying.ref.trim()} className="rounded border border-[#3FB950] px-2 py-1 text-[#3FB950] disabled:opacity-40" data-testid={`mark-paid-confirm-${inv.id}`}>Mark paid</button>
                        <button onClick={() => setPaying(null)} className="text-[#8B949E]">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setPaying({ id: inv.id, ref: '' })} className="rounded border border-[#30363D] px-2 py-1" data-testid={`mark-paid-${inv.id}`}>Mark paid…</button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={7} className="py-3 text-sm text-[#8B949E]">No invoices yet. Pick an organisation above to draft one from its counsel cases.</td></tr>}
          </tbody>
        </table>
      </section>

      {/* Prepaid credits from five-packs (persona plan §4). */}
      <section className="mt-8" data-testid="credits">
        <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Credits · five-packs</h2>
        {credits ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Tile label="Credits issued" value={String(credits.issued)} hint="five per pack" />
              <Tile label="Credits live" value={String(credits.live)} hint="unspent, unexpired" tone={credits.live ? 'ok' : undefined} />
              <Tile label="Credits consumed" value={String(credits.consumed)} hint="spent on a record" />
              <Tile label="Credits expired" value={String(credits.expired)} hint="12 months from issue" tone={credits.expired ? 'warn' : undefined} />
            </div>
            {credits.rows.length > 0 && (
              <div className="mt-2 rounded border border-[#30363D] bg-[#161B22] text-xs">
                {credits.rows.slice(0, 25).map((c) => (
                  <div key={c.id} className="flex items-center gap-3 border-b border-[#21262D] px-3 py-2 last:border-b-0">
                    <span className={`w-20 shrink-0 font-mono text-[10px] font-semibold ${c.state === 'LIVE' ? 'text-[#3FB950]' : c.state === 'CONSUMED' ? 'text-[#8B949E]' : 'text-[#D29922]'}`}>{c.state}</span>
                    <span className="min-w-0 flex-1 truncate">{c.organisation?.name ?? c.buyer?.email ?? '—'} · {c.rung.toLowerCase()} · pack {c.packId.slice(-6)}</span>
                    <span className="shrink-0 font-mono text-[#8B949E]">{c.consumedAt ? `spent ${when(c.consumedAt)}` : `expires ${new Date(c.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : <p className="mt-2 text-sm text-[#8B949E]">Loading…</p>}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[11px] uppercase tracking-wider text-[#8B949E]">Payments</h2>
            <div className="flex rounded border border-[#30363D] bg-[#0D1117] p-0.5 text-xs" data-testid="status-filter">
              {FILTERS.map(([value, label]) => (
                <button key={value} onClick={() => setFilter(value)} className={`rounded px-2.5 py-1 ${filter === value ? 'bg-[#161B22] text-[#D4AF37]' : 'text-[#8B949E]'}`}>{label}{value === '' && payments.total ? ` (${payments.total})` : ''}</button>
              ))}
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setTerm(q.trim()) }} className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer email, case, promo code, or Stripe id" className="w-80 rounded border border-[#30363D] bg-[#161B22] p-1.5 text-xs" />
            <button className="rounded border border-[#30363D] px-3 py-1.5 text-xs">Search</button>
          </form>
        </div>
        <table className="mt-3 w-full border-collapse text-sm" data-testid="payments-table">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2">Date</th><th>Customer</th><th>Case</th><th>Kind</th><th>Rung</th><th className="text-right">Amount</th><th>Promo</th><th>Status</th><th>Stripe</th><th></th>
            </tr>
          </thead>
          <tbody>
            {payments.rows.map((p) => (
              <tr key={p.id} className="border-b border-[#21262D]">
                <td className="py-2 font-mono text-xs text-[#8B949E]">{when(p.createdAt)}</td>
                <td className="text-xs">{p.customerEmail ?? '—'}</td>
                <td className="font-semibold">{p.caseTitle ?? '—'}</td>
                <td className="text-xs">{p.kind.toLowerCase()}</td>
                <td className="font-mono text-[11px] text-[#8B949E]">{p.sku ? p.sku.replace('COUNSEL_', '').replace('PACK_', 'pack ').toLowerCase() : '—'}</td>
                <td className="text-right font-mono tabular-nums">{usd(p.amountCents)}</td>
                <td className="font-mono text-xs text-[#D4AF37]">{p.promoCode ?? <span className="text-[#8B949E]">—</span>}</td>
                <td><StatusChip p={p} /></td>
                <td className="font-mono text-xs">
                  {p.paymentIntentId ? <a href={`https://dashboard.stripe.com/${summary?.stripe === 'test' ? 'test/' : ''}payments/${p.paymentIntentId}`} target="_blank" rel="noreferrer" className="text-[#3B82F6]">{p.paymentIntentId.slice(0, 8)}… ↗</a>
                    : p.free ? <span className="text-[#8B949E]">no charge</span>
                    : <span className="text-[#8B949E]" title={p.stripeId}>{p.stripeId.slice(0, 8)}…</span>}
                </td>
                <td className="text-right text-xs">
                  {p.free ? <span className="text-[#8B949E]">nothing to refund</span>
                    : p.disputeStatus === 'open' ? <span className="text-[#8B949E]">frozen by Stripe</span>
                    : p.remainingCents > 0 && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(p.status)
                      ? <button onClick={() => setTarget(p)} className="rounded border border-[#D29922] px-2 py-1 text-[#D29922]" data-testid={`refund-${p.id}`}>{p.refundedCents > 0 ? 'Refund rest…' : 'Refund…'}</button>
                      : <span className="text-[#8B949E]">{p.refundedAt ? when(p.refundedAt) : '—'}</span>}
                </td>
              </tr>
            ))}
            {payments.rows.length === 0 && <tr><td colSpan={10} className="py-3 text-sm text-[#8B949E]">No payments match.</td></tr>}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[#8B949E]">Showing {payments.rows.length} of {payments.total} · every row is retained 7 years and survives case deletion.</p>
      </section>

      {target && <RefundDialog payment={target} onClose={() => setTarget(null)} onDone={(m) => void done(m)} />}
    </div>
  )
}
