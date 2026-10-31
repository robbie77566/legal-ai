'use client'

/**
 * One account (staff_console.md §12 "Sign-in log and alerts", 2026-10-31):
 * the page the admin's first-sign-in SMS links to, and the row a staff
 * member opens from the Accounts list. Any account — family, professional
 * or staff. A summary (name, email, kind, role and grants, organisation,
 * bar status for a professional, created, last sign-in, count, cases,
 * backup email — masked for Support by the api) and the last 20 sign-in
 * attempts with outcome, time, IP and the device. Read-only; deletion stays
 * on the Accounts list with its typed confirmation.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { opsGetAccount, type AccountSummary } from '@/lib/api'
import { formatWhen } from '@/lib/duration'
import { OUTCOME_LABEL, OutcomeBadge } from '@/lib/sign-ins'

const KIND_LABEL: Record<AccountSummary['accountKind'], string> = { FAMILY: 'Family', PROFESSIONAL: 'Professional', STAFF: 'Staff' }
const ORG_KIND: Record<string, string> = { FIRM: 'Firm', PD_OFFICE: 'Public defender office', CLINIC: 'Clinic', FAMILY: 'Family' }
const BAR_LABEL: Record<string, string> = { PENDING: 'pending verification', VERIFIED: 'verified', REJECTED: 'could not verify' }

function Fact({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <div className="rounded border border-[#30363D] bg-[#0D1117] p-3" data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wider text-[#8B949E]">{label}</div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  )
}

export default function AccountPage() {
  const { id } = useParams<{ id: string }>()
  const [account, setAccount] = useState<AccountSummary | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let live = true
    void opsGetAccount(id).then(async (r) => {
      if (!live) return
      if (r.status === 404) return setState('missing')
      if (!r.ok) return setState('error')
      setAccount((await r.json()) as AccountSummary)
      setState('ok')
    }).catch(() => live && setState('error'))
    return () => { live = false }
  }, [id])

  if (state === 'loading') return <p className="text-sm text-[#8B949E]">Loading…</p>
  if (state === 'missing') {
    return (
      <div data-testid="account-missing">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">No account with that id</h1>
        <p className="mt-2 text-sm text-[#8B949E]">It may have been deleted. <Link href="/ops/accounts" className="underline">Back to Accounts</Link></p>
      </div>
    )
  }
  if (state === 'error' || !account) return <p className="text-sm text-[#F85149]">Could not load this account.</p>

  const a = account
  return (
    <div data-testid="account-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/ops/accounts" className="text-xs text-[#8B949E] hover:text-[#E6EDF3]">← Accounts</Link>
          <h1 className="font-serif text-xl font-bold text-[#D4AF37]" data-testid="account-name">{a.name || 'No name'}</h1>
          <p className="mt-1 font-mono text-sm" data-testid="account-email">
            {a.email}
            <span className="ml-2 rounded bg-[#21262D] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-[#D4AF37]" data-testid="account-kind">{KIND_LABEL[a.accountKind] ?? a.accountKind}</span>
            {a.deletedAt && <span className="ml-2 rounded bg-[#F85149]/20 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-[#F85149]">deleted {formatWhen(a.deletedAt)}</span>}
            {a.organisation?.isTest && <span className="ml-2 rounded bg-[#21262D] px-1.5 py-0.5 font-sans text-[11px] text-[#8B949E]">test organisation</span>}
          </p>
        </div>
        <Link href={`/ops/sign-ins?q=${encodeURIComponent(a.email)}`} className="rounded border border-[#30363D] px-3 py-1.5 text-xs text-[#8B949E] hover:border-[#D4AF37] hover:text-[#E6EDF3]" data-testid="account-log-link">
          Every attempt for this address →
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Role" testId="fact-role">
          {a.role}{a.seat ? ` · ${a.seat.toLowerCase()} seat` : ''}
          {a.grants.length > 0 && <div className="text-xs text-[#8B949E]">grants: {a.grants.join(', ')}</div>}
        </Fact>
        <Fact label="Organisation" testId="fact-organisation">
          {a.organisation ? (
            <Link href={`/ops/organisations/${a.organisation.id}`} className="underline">{a.organisation.name}</Link>
          ) : '—'}
          {a.organisation && <div className="text-xs text-[#8B949E]">{ORG_KIND[a.organisation.kind] ?? a.organisation.kind}</div>}
        </Fact>
        {a.bar && (
          <Fact label="Bar" testId="fact-bar">
            <span className={a.bar.status === 'VERIFIED' ? 'text-[#3FB950]' : a.bar.status === 'REJECTED' ? 'text-[#F85149]' : 'text-[#D29922]'}>{BAR_LABEL[a.bar.status] ?? a.bar.status}</span>
            <div className="font-mono text-xs text-[#8B949E]">{a.bar.number ? `${a.bar.state ?? 'TX'} ${a.bar.number}` : 'no bar number'}{a.bar.practiceType ? ` · ${a.bar.practiceType}` : ''}</div>
          </Fact>
        )}
        <Fact label="Created" testId="fact-created">{formatWhen(a.createdAt)}</Fact>
        <Fact label="Last sign-in" testId="fact-last-sign-in">
          {formatWhen(a.lastSignInAt)}
          <div className="text-xs text-[#8B949E]">{a.signInCount} sign-in{a.signInCount === 1 ? '' : 's'}</div>
        </Fact>
        <Fact label="Cases" testId="fact-cases">{a.cases}</Fact>
        <Fact label="Backup email" testId="fact-backup-email">
          {a.backupEmail ? (
            <>
              <span className="font-mono text-xs">{a.backupEmail.address}</span>
              <div className={`text-xs ${a.backupEmail.verified ? 'text-[#3FB950]' : 'text-[#D29922]'}`}>{a.backupEmail.verified ? `verified ${formatWhen(a.backupEmail.verifiedAt)}` : 'not verified'}</div>
            </>
          ) : 'none'}
        </Fact>
      </div>

      <h2 className="mt-8 font-serif text-lg font-bold text-[#D4AF37]">Sign-in attempts</h2>
      <p className="mt-1 text-xs text-[#8B949E]">The last {a.attempts.length} for this account, newest first. Kept 180 days.</p>
      {a.attempts.length === 0 ? (
        <p className="mt-3 text-sm text-[#8B949E]" data-testid="account-attempts-empty">No attempts recorded yet.</p>
      ) : (
        <table className="mt-3 w-full border-collapse text-sm" data-testid="account-attempts">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-xs uppercase tracking-wider text-[#8B949E]">
              <th className="py-2 pr-3">When</th><th className="py-2 pr-3">Outcome</th><th className="py-2 pr-3">IP</th><th className="py-2">Device</th>
            </tr>
          </thead>
          <tbody>
            {a.attempts.map((t) => (
              <tr key={t.id} className="border-b border-[#161B22]" data-testid={`attempt-${t.id}`}>
                <td className="py-2 pr-3 font-mono text-xs">{formatWhen(t.createdAt)}</td>
                <td className="py-2 pr-3"><OutcomeBadge outcome={t.outcome} />{t.firstSignIn && <span className="ml-2 rounded bg-[#D4AF37]/20 px-1.5 text-[11px] text-[#D4AF37]" title={OUTCOME_LABEL.SUCCESS}>first</span>}</td>
                <td className="py-2 pr-3 font-mono text-xs">{t.ip ?? '—'}</td>
                <td className="py-2 text-xs text-[#8B949E]">{t.userAgent ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
