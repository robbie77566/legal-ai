import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import CaseInterview from '@/app/(daybreak)/case/[caseId]/interview/page'
import { LangProvider } from '@/lib/i18n'
import { INTERVIEW_CONTENT } from '@/lib/content/interview'

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
    { key: 'vehicle', label: 'How we read this record', value: 'as an Article 11.072 case (a lawyer decides what, if anything, is filed)', derived: true },
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
    expect(known).toHaveTextContent(/as an Article 11\.072 case \(a lawyer decides what, if anything, is filed\).*from your answers/)
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

  it('a stored judgment date that is not ISO is not prefilled (a date input cannot hold it) — the field stays blank', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...CHECKLIST, facts: { ...CHECKLIST.facts, judgmentDate: '06/14/2019' } }) }) as Response))
    render(<CaseInterview />)
    await screen.findByTestId('known-facts')
    expect((screen.getByLabelText('Judgment date') as HTMLInputElement).value).toBe('')
  })

  it('an ISO judgment date is prefilled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ...CHECKLIST, facts: { ...CHECKLIST.facts, judgmentDate: '2019-06-14' } }) }) as Response))
    render(<CaseInterview />)
    await screen.findByTestId('known-facts')
    expect((screen.getByLabelText('Judgment date') as HTMLInputElement).value).toBe('2019-06-14')
  })

  it('while collecting documents the shaping answers can be changed — the writ answer PATCHes and the card updates (PO, 2026-09-12)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.endsWith('/facts') && init?.method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ facts: { ...CHECKLIST.facts, priorWrit: 'yes' }, factLines: CHECKLIST.factLines.map((l) => (l.key === 'priorWrit' ? { ...l, value: 'Yes — a writ was filed before' } : l)), checklistItemCount: 8 }) } as Response
      }
      return { ok: true, status: 200, json: async () => (u.endsWith('/checklist') ? CHECKLIST : { checklistItemCount: 5 }) } as Response
    }))
    render(<CaseInterview />)
    await screen.findByTestId('known-facts')
    fireEvent.click(screen.getByTestId('change-answers'))
    const form = screen.getByTestId('change-answers-form')
    expect(form).toHaveTextContent(/Has a writ .* been filed before/)
    fireEvent.click(within(screen.getByTestId('shape-priorWrit')).getByLabelText('Yes'))
    fireEvent.click(screen.getByTestId('save-answers'))
    await waitFor(() => {
      const patch = calls.find((c) => c.url.endsWith('/cases/case_1/facts') && c.init?.method === 'PATCH')
      expect(patch).toBeTruthy()
      expect(JSON.parse(String(patch!.init!.body))).toEqual({ trialOrPlea: 'trial', appeal: 'decided', priorWrit: 'yes' })
    })
    expect(await screen.findByText(/Yes — a writ was filed before/)).toBeInTheDocument()
    expect(screen.queryByTestId('change-answers-form')).toBeNull()
  })

  it('after records-complete the shaping answers are locked — no change control', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => ({ ok: true, status: 200, json: async () => (String(url).endsWith('/checklist') ? { ...CHECKLIST, status: 'ANALYZING' } : {}) }) as Response))
    render(<CaseInterview />)
    await screen.findByTestId('locked-note')
    expect(screen.queryByTestId('change-answers')).toBeNull()
  })

  describe('whose record this is (Case.subjectName, 2026-11-01)', () => {
    it('is the first question, in English by default and in Spanish with the switch, with en/es parity', async () => {
      render(<CaseInterview />)
      await screen.findByTestId('known-facts')
      const form = screen.getByTestId('subject-name-question')
      expect(form).toHaveTextContent(INTERVIEW_CONTENT.en.subjectName.label)
      expect(form).toHaveTextContent(INTERVIEW_CONTENT.en.subjectName.hint)
      // First: the question precedes the county question in document order.
      const inputs = Array.from(document.querySelectorAll('form input'))
      expect(inputs[0]).toBe(screen.getByTestId('subject-name'))
      expect((inputs[0] as HTMLInputElement).maxLength).toBe(120)
      expect(inputs[0]).not.toBeRequired()

      window.localStorage.setItem('snl_lang', 'es')
      render(<LangProvider><CaseInterview /></LangProvider>)
      await waitFor(() => expect(screen.getAllByTestId('subject-name-question')[1]).toHaveTextContent(INTERVIEW_CONTENT.es.subjectName.label))
      expect(INTERVIEW_CONTENT.es.subjectName.label).not.toBe(INTERVIEW_CONTENT.en.subjectName.label)
      expect(Object.keys(INTERVIEW_CONTENT.es.subjectName).sort()).toEqual(Object.keys(INTERVIEW_CONTENT.en.subjectName).sort())
      window.localStorage.removeItem('snl_lang')
    })

    it('submits the name with the interview, trimmed', async () => {
      render(<CaseInterview />)
      await screen.findByTestId('known-facts')
      fireEvent.change(screen.getByTestId('subject-name'), { target: { value: '  Juan Pérez ' } })
      fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
      await waitFor(() => {
        const post = calls.find((c) => c.url.endsWith('/cases/case_1/interview') && c.init?.method === 'POST')
        expect(post).toBeTruthy()
        expect(JSON.parse(String(post!.init!.body))).toMatchObject({ subjectName: 'Juan Pérez', county: 'Travis' })
      })

    })

    it('left blank on a case that never had one, it is not sent at all — an existing interview still completes', async () => {
      render(<CaseInterview />)
      await screen.findByTestId('known-facts')
      fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }))
      await waitFor(() => {
        const post = calls.find((c) => c.url.endsWith('/cases/case_1/interview') && c.init?.method === 'POST')
        expect(post).toBeTruthy()
        expect(JSON.parse(String(post!.init!.body))).not.toHaveProperty('subjectName')
      })
    })

    it('prefills a stored name, and clearing it sends null — on the locked page through PATCH /facts', async () => {
      vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url)
        calls.push({ url: u, init })
        return { ok: true, status: 200, json: async () => (u.endsWith('/checklist') ? { ...CHECKLIST, status: 'ANALYZING', subjectName: 'Juan Pérez' } : { facts: {} }) } as Response
      }))
      render(<CaseInterview />)
      await screen.findByTestId('locked-note')
      expect((screen.getByTestId('subject-name') as HTMLInputElement).value).toBe('Juan Pérez')
      fireEvent.change(screen.getByTestId('subject-name'), { target: { value: '   ' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
      await waitFor(() => {
        const patch = calls.find((c) => c.url.endsWith('/cases/case_1/facts') && c.init?.method === 'PATCH')
        expect(patch).toBeTruthy()
        expect(JSON.parse(String(patch!.init!.body))).toMatchObject({ subjectName: null, county: 'Travis' })
      })
    })
  })
})
