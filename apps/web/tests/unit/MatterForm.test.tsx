import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EMPTY_MATTER_FORM, VEHICLE_OPTIONS, matterBodyFor, validateMatterForm } from '@/lib/counsel'
import MatterForm from '@/components/counsel/MatterForm'

/**
 * F3 — the matter form's validation mirrors MatterCreateSchema
 * (packages/case-lifecycle/matters.ts): initials are one to four letters,
 * the vehicle is the enum, county is required; the capital refusal comes
 * back from the api as a 422 and is shown inline.
 */
const base = { ...EMPTY_MATTER_FORM, county: 'Bexar', clientInitials: 'JF' }

describe('validateMatterForm (= MatterCreateSchema in the browser)', () => {
  it('accepts a minimal direct appeal', () => {
    expect(validateMatterForm(base)).toEqual({})
  })
  it('initials: one to four letters, never a name', () => {
    expect(validateMatterForm({ ...base, clientInitials: 'JFXYZ' }).clientInitials).toMatch(/one to four letters/)
    expect(validateMatterForm({ ...base, clientInitials: 'John Fixture' }).clientInitials).toMatch(/never a name/)
    expect(validateMatterForm({ ...base, clientInitials: '' }).clientInitials).toBeTruthy()
    expect(validateMatterForm({ ...base, clientInitials: 'abcd' })).toEqual({})
  })
  it('vehicle: the enum, nothing else', () => {
    expect(validateMatterForm({ ...base, vehicle: 'mandamus' }).vehicle).toBe('Choose a vehicle')
    for (const v of VEHICLE_OPTIONS) expect(validateMatterForm({ ...base, vehicle: v.id })).toEqual({})
  })
  it('county is required; a bad date is named; prior writs stay within 0–20', () => {
    expect(validateMatterForm({ ...base, county: '  ' }).county).toMatch(/County is required/)
    expect(validateMatterForm({ ...base, judgmentSignedAt: 'not a date' }).judgmentSignedAt).toBeTruthy()
    expect(validateMatterForm({ ...base, priorWrits: '21' }).priorWrits).toBeTruthy()
  })
  it('the body sent to the api drops blanks, upper-cases nothing itself (the schema does) and keeps the flags', () => {
    expect(matterBodyFor({ ...base, court: ' ', causeNumber: 'D-1', judgmentSignedAt: '2019-09-12', priorWrits: '2', subsequentWrit: true })).toEqual({
      vehicle: 'direct_appeal', county: 'Bexar', causeNumber: 'D-1', clientInitials: 'JF', judgmentSignedAt: '2019-09-12', priorWrits: 2, subsequentWrit: true, capital: false,
    })
  })
})

describe('<MatterForm />', () => {
  const calls: Array<{ url: string; body: unknown }> = []
  let answer: { status: number; body: unknown } = { status: 201, body: { caseId: 'case_1', matterId: 'm_1' } }
  beforeEach(() => {
    calls.length = 0
    answer = { status: 201, body: { caseId: 'case_1', matterId: 'm_1' } }
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined })
      return { ok: answer.status < 300, status: answer.status, json: async () => answer.body } as Response
    }))
  })

  it('lists every vehicle with its label and court, the capital one marked refused', () => {
    render(<MatterForm onCreated={() => {}} />)
    for (const v of VEHICLE_OPTIONS) {
      expect(screen.getByTestId(`vehicle-${v.id}`)).toBeInTheDocument()
      expect(screen.getByText(v.label)).toBeInTheDocument()
    }
    expect(screen.getByText('Refused')).toBeInTheDocument()
    expect(screen.getByText(/Never a name/)).toBeInTheDocument()
  })

  it('refuses five-letter initials before anything is sent', async () => {
    render(<MatterForm onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^County/), { target: { value: 'Bexar' } })
    fireEvent.change(screen.getByLabelText(/^Client initials/), { target: { value: 'ABCDE' } })
    fireEvent.click(screen.getByTestId('matter-submit'))
    expect(await screen.findByText(/one to four letters/)).toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('posts the body and hands the caseId back on 201', async () => {
    const onCreated = vi.fn()
    render(<MatterForm onCreated={onCreated} />)
    fireEvent.click(screen.getByTestId('vehicle-11.07'))
    fireEvent.change(screen.getByLabelText(/^County/), { target: { value: 'Travis' } })
    fireEvent.change(screen.getByLabelText(/^Client initials/), { target: { value: 'jf' } })
    fireEvent.change(screen.getByLabelText(/^Cause number/), { target: { value: 'D-1-DC-19-000000' } })
    fireEvent.click(screen.getByTestId('matter-submit'))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('case_1'))
    expect(calls[0].url).toMatch(/\/counsel\/matters$/)
    expect(calls[0].body).toMatchObject({ vehicle: '11.07', county: 'Travis', clientInitials: 'jf', causeNumber: 'D-1-DC-19-000000', capital: false })
  })

  it('shows the capital refusal inline from the api 422', async () => {
    answer = { status: 422, body: { error: 'Capital cases are refused for the Counsel Review (persona rollout plan §5 C).', reason: 'CAPITAL_REFUSED' } }
    render(<MatterForm onCreated={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^County/), { target: { value: 'Bexar' } })
    fireEvent.change(screen.getByLabelText(/^Client initials/), { target: { value: 'JF' } })
    fireEvent.click(screen.getByTestId('matter-capital'))
    fireEvent.click(screen.getByTestId('matter-submit'))
    expect(await screen.findByTestId('matter-server-error')).toHaveTextContent(/Capital cases are refused/)
    expect(calls[0].body).toMatchObject({ capital: true })
  })
})
