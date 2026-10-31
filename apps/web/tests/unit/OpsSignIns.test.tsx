import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AccountPage from '@/app/ops/accounts/[id]/page'
import SignInsPage from '@/app/ops/sign-ins/page'
import OpsOverview from '@/app/ops/page'
import AccountAdmin from '@/app/ops/accounts/page'

/**
 * W5 — sign-in log and alerts (staff_console.md §12): the account page the
 * SMS links to, the log page (filters → helper call), the two Today tiles,
 * and the Accounts list linking each row to its account page.
 */

const nav = vi.hoisted(() => ({ search: '' as string, id: 'u_fam' }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/ops',
  useParams: () => ({ id: nav.id }),
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'ADMIN', email: 'robbie@snotnoselegal.com' } }, status: 'authenticated' }), signOut: vi.fn() }))

const ATTEMPTS = [
  { id: 'a2', email: 'maria@example.com', userId: 'u_fam', outcome: 'BAD_PASSWORD', firstSignIn: false, ip: '203.0.113.9', userAgent: 'Safari 17 · iOS', createdAt: '2026-10-31T14:05:00Z' },
  { id: 'a1', email: 'maria@example.com', userId: 'u_fam', outcome: 'SUCCESS', firstSignIn: true, ip: '203.0.113.9', userAgent: 'Safari 17 · iOS', createdAt: '2026-10-30T15:00:00Z' },
  { id: 'a0', email: 'nobody@example.com', userId: null, outcome: 'UNKNOWN_EMAIL', firstSignIn: false, ip: '192.0.2.1', userAgent: 'curl/8.4.0', createdAt: '2026-10-29T15:00:00Z' },
]
const FAMILY = {
  id: 'u_fam', email: 'maria@example.com', name: 'Maria Delgado', accountKind: 'FAMILY', role: 'CLIENT', grants: [], seat: null, organisation: null, bar: null,
  createdAt: '2026-10-30T14:00:00Z', deletedAt: null, lastSignInAt: '2026-10-30T15:00:00Z', signInCount: 1, cases: 1,
  backupEmail: { address: 'b•••@example.com', verified: true, verifiedAt: '2026-10-30T16:00:00Z' },
  attempts: ATTEMPTS.slice(0, 2),
}
const COUNSEL = {
  ...FAMILY, id: 'u_pro', email: 'dana@firm.example', name: 'Dana Ortiz', accountKind: 'PROFESSIONAL', seat: 'OWNER',
  organisation: { id: 'org1', kind: 'FIRM', name: 'Ortiz & Vale PLLC', isTest: false },
  bar: { number: '24011111', state: 'TX', status: 'VERIFIED', verifiedAt: '2026-10-28T00:00:00Z', practiceType: 'writ' },
  backupEmail: null, cases: 0, attempts: [],
}
const STATUS = {
  email: { configured: true, from: 'x' }, stripe: 'test', autoApprove: false, malwareScan: true, sentry: true, posthog: false,
  pipeline: { awaitingDocs: 0, digitizing: 0, analyzing: 0, held: 0, ready: 0 }, retentionCandidates: 0,
  signIns: { firstToday: 2, failed24h: 23 },
}

const calls: string[] = []
function stubFetch(bodies: Record<string, unknown>, status = 200) {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url)
    calls.push(u)
    const key = Object.keys(bodies).find((k) => u.includes(k))
    const ok = !!key && status < 400
    return { ok, status: key ? status : 404, json: async () => (key ? bodies[key] : {}) } as Response
  }))
}

beforeEach(() => { nav.search = ''; nav.id = 'u_fam' })

describe('account page (the SMS link lands here)', () => {
  it('a family account: name, email, kind, created, last sign-in with count, cases, verified backup email, attempts with outcome / IP / device', async () => {
    stubFetch({ '/ops/accounts/u_fam': FAMILY })
    render(<AccountPage />)
    expect(await screen.findByTestId('account-name')).toHaveTextContent('Maria Delgado')
    expect(screen.getByTestId('account-email')).toHaveTextContent('maria@example.com')
    expect(screen.getByTestId('account-kind')).toHaveTextContent('Family')
    expect(screen.getByTestId('fact-role')).toHaveTextContent('CLIENT')
    expect(screen.getByTestId('fact-organisation')).toHaveTextContent('—')
    expect(screen.queryByTestId('fact-bar')).toBeNull()
    expect(screen.getByTestId('fact-created')).toHaveTextContent('Oct 30, 2026')
    expect(screen.getByTestId('fact-last-sign-in')).toHaveTextContent('1 sign-in')
    expect(screen.getByTestId('fact-cases')).toHaveTextContent('1')
    expect(screen.getByTestId('fact-backup-email')).toHaveTextContent('b•••@example.com')
    expect(screen.getByTestId('fact-backup-email')).toHaveTextContent(/verified/)
    const table = screen.getByTestId('account-attempts')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(screen.getByTestId('attempt-a2')).toHaveTextContent('wrong password')
    expect(screen.getByTestId('attempt-a2')).toHaveTextContent('203.0.113.9')
    expect(screen.getByTestId('attempt-a2')).toHaveTextContent('Safari 17 · iOS')
    expect(screen.getByTestId('attempt-a1')).toHaveTextContent('signed in')
    expect(screen.getByTestId('attempt-a1')).toHaveTextContent('first')
    expect(screen.getByTestId('account-log-link')).toHaveAttribute('href', '/ops/sign-ins?q=maria%40example.com')
    expect(calls[0]).toBe('http://localhost:3001/ops/accounts/u_fam')
  })

  it('a professional account: organisation (linked), seat, bar status and number, no backup email, no attempts', async () => {
    nav.id = 'u_pro'
    stubFetch({ '/ops/accounts/u_pro': COUNSEL })
    render(<AccountPage />)
    expect(await screen.findByTestId('account-kind')).toHaveTextContent('Professional')
    expect(screen.getByTestId('fact-organisation')).toHaveTextContent('Ortiz & Vale PLLC')
    expect(screen.getByTestId('fact-organisation')).toHaveTextContent('Firm')
    expect(screen.getByRole('link', { name: 'Ortiz & Vale PLLC' })).toHaveAttribute('href', '/ops/organisations/org1')
    expect(screen.getByTestId('fact-role')).toHaveTextContent('owner seat')
    expect(screen.getByTestId('fact-bar')).toHaveTextContent('verified')
    expect(screen.getByTestId('fact-bar')).toHaveTextContent('TX 24011111')
    expect(screen.getByTestId('fact-backup-email')).toHaveTextContent('none')
    expect(screen.getByTestId('account-attempts-empty')).toBeInTheDocument()
  })

  it('an unknown id says so instead of rendering an empty page', async () => {
    nav.id = 'gone'
    stubFetch({ '/ops/accounts/gone': {} }, 404)
    render(<AccountPage />)
    expect(await screen.findByTestId('account-missing')).toHaveTextContent(/No account with that id/)
  })
})

describe('sign-ins page', () => {
  const PAGE = { attempts: ATTEMPTS, page: 1, pageSize: 50, total: 3, hasMore: false }

  it('lists attempts newest first, links a known account, and the filters drive the helper call', async () => {
    stubFetch({ '/ops/sign-ins': PAGE })
    render(<SignInsPage />)
    expect(await screen.findByTestId('sign-ins-count')).toHaveTextContent('3 attempts')
    expect(calls[0]).toBe('http://localhost:3001/ops/sign-ins?pageSize=50')
    const rows = screen.getByTestId('sign-ins-table').querySelectorAll('tbody tr')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('maria@example.com')
    expect(rows[0]).toHaveTextContent('wrong password')
    expect(rows[1]).toHaveTextContent('first')
    expect(rows[2]).toHaveTextContent('no such account')
    expect(rows[2]).toHaveTextContent('curl/8.4.0')
    // Known account → its page; a stranger's address is plain text.
    expect(screen.getAllByRole('link', { name: 'maria@example.com' })[0]).toHaveAttribute('href', '/ops/accounts/u_fam')
    expect(screen.queryByRole('link', { name: 'nobody@example.com' })).toBeNull()

    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'FAILED' } })
    await waitFor(() => expect(calls.at(-1)).toBe('http://localhost:3001/ops/sign-ins?outcome=FAILED&pageSize=50'))
    fireEvent.click(screen.getByLabelText('First sign-ins only'))
    await waitFor(() => expect(calls.at(-1)).toBe('http://localhost:3001/ops/sign-ins?outcome=FAILED&first=1&pageSize=50'))
    fireEvent.change(screen.getByLabelText('Filter by email'), { target: { value: 'maria' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(calls.at(-1)).toBe('http://localhost:3001/ops/sign-ins?outcome=FAILED&q=maria&first=1&pageSize=50'))
    expect(screen.getByTestId('sign-ins-count')).toHaveTextContent(/first sign-ins only · failed \(any reason\) · matching “maria”/)
  })

  it('the Today tile\'s ?first=1 and ?outcome=FAILED pre-set the filters', async () => {
    nav.search = 'first=1&outcome=FAILED'
    stubFetch({ '/ops/sign-ins': PAGE })
    render(<SignInsPage />)
    await waitFor(() => expect(calls[0]).toBe('http://localhost:3001/ops/sign-ins?outcome=FAILED&first=1&pageSize=50'))
    expect(screen.getByLabelText('First sign-ins only')).toBeChecked()
    expect(screen.getByLabelText('Outcome')).toHaveValue('FAILED')
  })

  it('pages: Older asks for page 2', async () => {
    stubFetch({ '/ops/sign-ins': { ...PAGE, total: 120, hasMore: true } })
    render(<SignInsPage />)
    const paging = await screen.findByTestId('sign-ins-paging')
    expect(paging).toHaveTextContent('page 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Older →' }))
    await waitFor(() => expect(calls.at(-1)).toBe('http://localhost:3001/ops/sign-ins?page=2&pageSize=50'))
  })
})

describe('Today page tiles', () => {
  it('"New accounts signed in today" and "Failed sign-ins (24h)" read /ops/status and link to the filtered log', async () => {
    stubFetch({ '/ops/status': STATUS, '/qa/holds': [], '/ops/queue': [], '/ops/requests': { open: [], decided: [] } })
    render(<OpsOverview />)
    const first = await screen.findByTestId('signins-first-today')
    expect(first).toHaveAttribute('href', '/ops/sign-ins?first=1')
    expect(first).toHaveTextContent('New accounts signed in today')
    expect(first).toHaveTextContent('2')
    expect(first).toHaveTextContent(/the admin was texted/)
    const failed = screen.getByTestId('signins-failed-24h')
    expect(failed).toHaveAttribute('href', '/ops/sign-ins?outcome=FAILED')
    expect(failed).toHaveTextContent('Failed sign-ins (24h)')
    expect(failed).toHaveTextContent('23')
    expect(failed).toHaveTextContent(/unusually many/)
  })

  it('an api without the numbers (older deploy) shows no sign-ins section rather than zeros', async () => {
    const { signIns: _omit, ...older } = STATUS
    void _omit
    stubFetch({ '/ops/status': older, '/qa/holds': [], '/ops/queue': [], '/ops/requests': { open: [], decided: [] } })
    render(<OpsOverview />)
    await screen.findByTestId('tile-email')
    expect(screen.queryByTestId('sign-ins')).toBeNull()
  })
})

describe('Accounts list', () => {
  it('links each row to its account page', async () => {
    stubFetch({ '/ops/accounts': [{ id: 'u1', email: 'maria@example.com', name: 'Maria', createdAt: '2026-08-01T10:00:00Z', deletedAt: null, cases: 1, lastLoginAt: null, loginCount: 0, visits: 0, avgSecondsOnSite: null, lastSeenAt: null }] })
    render(<AccountAdmin />)
    expect(await screen.findByTestId('account-link-u1')).toHaveAttribute('href', '/ops/accounts/u1')
  })
})
