import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CaseInterview from '@/app/(daybreak)/case/[caseId]/interview/page'

/** Never ask twice: the interview prefills from the case facts and hides
 *  the appeal question when the free check already answered it. */
vi.mock('next/navigation', () => ({ useParams: () => ({ caseId: 'case_1' }), useRouter: () => ({ push: vi.fn() }) }))

const CHECKLIST = {
  status: 'AWAITING_DOCS', items: [], documents: [], slaStartedAt: null, lastZip: null,
  facts: { county: 'Travis', convictionYear: 2019, appeal: 'decided', custody: 'probation', trialOrPlea: 'trial', priorWrit: 'no' },
  factLines: [
    { key: 'conviction', label: 'Conviction', value: 'Travis County · 2019' },
    { key: 'trialOrPlea', label: 'How it was decided', value: 'A trial', shapesReview: true },
    { key: 'custody', label: 'Where they are now', value: 'On probation (community supervision)' },
    { key: 'vehicle', label: 'Writ type', value: 'Article 11.072', derived: true },
    { key: 'appeal', label: 'Direct appeal', value: 'Decided (denied or affirmed)', shapesReview: true },
    { key: 'priorWrit', label: 'Prior writ', value: 'None that you know of', shapesReview: true },
  ],
}
const calls: Array<{ url: string; init?: RequestInit }> = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, init })
    return { ok: true, status: 200, json: async () => (u.endsWith('/checklist') ? CHECKLIST : { checklistItemCount: 5 }) } as Response
  }))
})

describe('interview', () => {
  it('shows what the free check already answered, prefills, hides the appeal question, and never resends it', async () => {
    render(<CaseInterview />)
    const known = await screen.findByTestId('known-facts')
    expect(known).toHaveTextContent(/Direct appeal.*Decided/)
    expect(known).toHaveTextContent(/Article 11\.072.*we chose this from your answers/)
    expect(screen.queryByTestId('appeal-question')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirm the details')
    expect((screen.getByDisplayValue('Travis') as HTMLInputElement).value).toBe('Travis')

    fireEvent.change(screen.getByLabelText('Judgment date'), { target: { value: '2019-06-14' } })
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
    await waitFor(() => {
      const post = calls.find((c) => c.url.endsWith('/cases/case_1/interview') && c.init?.method === 'POST')
      expect(post).toBeTruthy()
      const body = JSON.parse(String(post!.init!.body))
      expect(body).toMatchObject({ county: 'Travis', convictionYear: 2019, judgmentDate: '2019-06-14' })
      expect(body).not.toHaveProperty('hadAppeal')
    })
  })

  it('a brand-new case with no facts asks everything, including the appeal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...CHECKLIST, facts: {}, factLines: [] }) }) as Response))
    render(<CaseInterview />)
    expect(await screen.findByTestId('appeal-question')).toBeInTheDocument()
    expect(screen.queryByTestId('known-facts')).toBeNull()
  })

  it('after records-complete the page becomes "Case details": shaping facts locked, county/year/dates saved via PATCH', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      return { ok: true, status: 200, json: async () => (u.endsWith('/checklist') ? { ...CHECKLIST, status: 'ANALYZING' } : { facts: {} }) } as Response
    }))
    render(<CaseInterview />)
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Case details')
    expect(screen.getByTestId('locked-note')).toHaveTextContent(/how it was decided, direct appeal, prior writ/i)
    expect(screen.queryByTestId('appeal-question')).toBeNull()
    fireEvent.change(screen.getByDisplayValue('Travis'), { target: { value: 'Bexar' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      const patch = calls.find((c) => c.url.endsWith('/cases/case_1/facts') && c.init?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(JSON.parse(String(patch!.init!.body))).toMatchObject({ county: 'Bexar', convictionYear: 2019 })
    })
    expect(calls.some((c) => c.url.endsWith('/cases/case_1/interview') && c.init?.method === 'POST')).toBe(false)
  })
})
