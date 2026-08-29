import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EligibilityCheck from '@/app/(daybreak)/check/page'

// The wizard fires an anonymous draft beacon on outcome — stub the network.
const fetchMock = vi.fn(async () => ({
  ok: true,
  json: async () => ({ token: 'tok_test' }),
})) as unknown as typeof fetch

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  sessionStorage.clear()
})

const click = (label: RegExp) => fireEvent.click(screen.getByRole('radio', { name: label }))

describe('S0 eligibility wizard', () => {
  it('walks the trial fit path to the gold outcome with a purchase CTA', async () => {
    render(<EligibilityCheck />)
    click(/Texas state court/)
    click(/Felony/)
    click(/^No$/) // capital
    click(/In prison/)
    click(/A trial/)
    click(/It was decided/)
    click(/^No$/) // prior writ
    click(/^No$/) // new evidence

    expect(await screen.findByTestId('outcome-fit')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Continue — \$299/ })).toHaveAttribute('href', '/buy')
    await waitFor(() => expect(sessionStorage.getItem('snl_draft_token')).toBe('tok_test'))
  })

  it('capital answer hard-excludes immediately — no purchase path exists on screen', () => {
    render(<EligibilityCheck />)
    click(/Texas state court/)
    click(/Felony/)
    click(/^Yes$/) // capital

    expect(screen.getByTestId('outcome-capital')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue/ })).toBeNull()
    expect(screen.getByText(/appointed post-conviction counsel/i)).toBeInTheDocument()
  })

  it('a prior writ leads to the fit screen WITH the §4 warning before any CTA', async () => {
    render(<EligibilityCheck />)
    click(/Texas state court/)
    click(/Felony/)
    click(/^No$/)
    click(/In prison/)
    click(/A plea/)
    click(/It was decided/)
    click(/^Yes$/) // prior writ
    click(/^No$/) // new evidence

    expect(await screen.findByTestId('outcome-fit')).toBeInTheDocument()
    expect(screen.getByText(/severe bar for a second one/i)).toBeInTheDocument()
  })

  it('not-a-fit outcomes always pair the news with resources — never a dead end', () => {
    render(<EligibilityCheck />)
    click(/another state/)
    expect(screen.getByTestId('outcome-notfit')).toBeInTheDocument()
    expect(screen.getByText(/TIFA/)).toBeInTheDocument()
  })

  it('the back button unwinds one answer', () => {
    render(<EligibilityCheck />)
    click(/Texas state court/)
    expect(screen.getByRole('heading', { name: /felony or a misdemeanor/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(screen.getByRole('heading', { name: /Texas state court/ })).toBeInTheDocument()
  })
})
