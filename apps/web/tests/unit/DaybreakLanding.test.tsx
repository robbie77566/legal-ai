import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DaybreakLanding from '@/app/(daybreak)/review/page'

describe('Daybreak landing (landing_page_spec §2 canon)', () => {
  it('renders the canonical hero, price framing, and honesty filter', () => {
    render(<DaybreakLanding />)
    expect(
      screen.getByRole('heading', { name: /what.s really in the court record/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/\$299\. One price, no per-page fees\./)).toBeInTheDocument()
    expect(screen.getByText(/This is not for every case/)).toBeInTheDocument()
    expect(screen.getByText(/death-penalty cases/i)).toBeInTheDocument()
  })

  it('every CTA routes to the free check — the conversion event is the check, not the sale', () => {
    render(<DaybreakLanding />)
    // CTAs are the "free ... check" buttons; the free documents GUIDE link is
    // education, not a conversion CTA, and routes to /how-to-get-documents.
    const ctas = screen
      .getAllByRole('link', { name: /free/i })
      .filter((l) => !/guide/i.test(l.textContent ?? ''))
    expect(ctas.length).toBeGreaterThanOrEqual(2)
    for (const cta of ctas) expect(cta).toHaveAttribute('href', '/check')
  })

  it('carries the site-wide legal footer and no urgency theater', () => {
    render(<DaybreakLanding />)
    expect(screen.getByText(/not a law firm and does not provide legal advice/i)).toBeInTheDocument()
    expect(screen.queryByText(/countdown|spots left|act now/i)).toBeNull()
  })
})
