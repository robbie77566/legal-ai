'use client'

/** Account admin (2026-09-02) — Industrial Authority. Consumer accounts
 *  only; deletion routes cases through OPS-4 and anonymizes the user row
 *  (ledger survives, email freed). The exact email must be retyped —
 *  never a one-misclick action. */
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

interface Account {
  id: string
  email: string
  name: string | null
  createdAt: string
  deletedAt: string | null
  cases: number
}

export default function AccountAdmin() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Account[]>([])
  const [confirming, setConfirming] = useState<Account | null>(null)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [notice, setNotice] = useState('')

  const load = async (term: string) => {
    const r = await apiFetch(`/ops/accounts${term ? `?q=${encodeURIComponent(term)}` : ''}`)
    if (r.ok) setResults(await r.json())
  }
  useEffect(() => {
    void load('')
  }, [])

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setNotice('')
    await load(q)
  }

  const doDelete = async () => {
    if (!confirming) return
    setNotice('')
    const r = await apiFetch(`/ops/accounts/${confirming.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmEmail }),
    })
    const body = await r.json().catch(() => ({}))
    if (r.ok) {
      setNotice(
        `Deleted ${body.originalEmail}: ${body.casesDeleted.length} case(s) removed, ${body.sharesRemoved} share(s) revoked. The email is free for reuse; the payment ledger is retained by design.`
      )
      setConfirming(null)
      setConfirmEmail('')
      setResults((rs) => rs.map((a) => (a.id === confirming.id ? { ...a, deletedAt: new Date().toISOString() } : a)))
    } else {
      setNotice(body.error ?? 'Deletion failed')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold text-[#D4AF37]">Accounts</h1>
      </div>

      <form onSubmit={search} className="mt-6 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by email (leave empty to list all)"
          className="w-96 rounded border border-[#30363D] bg-[#0D1117] px-3 py-2 text-sm"
        />
        <button className="rounded border border-[#30363D] px-4 py-2 text-sm hover:border-[#D4AF37]">Search</button>
      </form>

      {notice && <p className="mt-3 text-sm text-[#D29922]">{notice}</p>}

      <p className="mt-4 text-xs text-[#8B949E]" data-testid="accounts-count">
        {results.length} customer account{results.length === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}
        {results.length === 0 && !q ? ' — none exist yet on this environment' : ''}
      </p>

      {results.length > 0 && (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#30363D] text-left text-[#8B949E]">
              <th className="py-2">Email</th>
              <th>Name</th>
              <th>Cases</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {results.map((a) => (
              <tr key={a.id} className="border-b border-[#21262D]">
                <td className="py-2 font-mono text-xs">{a.email}</td>
                <td>{a.name ?? '—'}</td>
                <td>{a.cases}</td>
                <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                <td className="text-right">
                  {a.deletedAt ? (
                    <span className="text-xs text-[#8B949E]">deleted</span>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirming(a)
                        setConfirmEmail('')
                      }}
                      className="rounded border border-[#DA3633] px-3 py-1 text-xs text-[#DA3633] hover:bg-[#DA3633] hover:text-white"
                    >
                      Delete account
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {confirming && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-6" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded border border-[#30363D] bg-[#0D1117] p-5">
            <h2 className="font-serif text-lg font-bold text-[#DA3633]">Delete this account?</h2>
            <p className="mt-2 text-sm text-[#8B949E]">
              All {confirming.cases} case(s) will be deleted through the scoped-deletion machinery
              (documents, findings, reports, S3 objects). The payment ledger and disclosure-ack
              archive are retained by design. The user row is anonymized and{' '}
              <span className="font-mono">{confirming.email}</span> becomes free for reuse. This
              cannot be undone.
            </p>
            <label className="mt-4 block text-sm">
              Type the account email to confirm:
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                className="mt-1 w-full rounded border border-[#30363D] bg-[#0B0E14] px-3 py-2 font-mono text-xs"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => void doDelete()}
                disabled={confirmEmail.trim().toLowerCase() !== confirming.email.toLowerCase()}
                className="rounded bg-[#DA3633] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Delete permanently
              </button>
              <button
                onClick={() => setConfirming(null)}
                className="rounded border border-[#30363D] px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
