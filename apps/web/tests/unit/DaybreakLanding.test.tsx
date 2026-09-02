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

  it('answers the ChatGPT objection above the fold with mechanism, not superlatives', () => {
    render(<DaybreakLanding />)
    const block = screen.getByTestId('why-not-chatgpt')
    // Concedes the true thing (uploads work) and argues what happens AFTER
    expect(block).toHaveTextContent(/upload it to ChatGPT/)
    expect(block).toHaveTextContent(/You can\. Here is what you would be missing/)
    expect(block).toHaveTextContent(/thrown out before you see it/)
    expect(block).toHaveTextContent(/questions a Texas post-conviction lawyer asks/)
    expect(block).toHaveTextContent(/can sound sure when it’s wrong/)
    expect(block).not.toHaveTextContent(/fits in one message/) // the weak claim is gone
    expect(screen.getByTestId('hero-sample-link')).toHaveAttribute('href', '/sample-report')
    expect(screen.queryByText(/world-class/i)).toBeNull()
  })

  it('makes no claim the pipeline no longer keeps (no per-report human review)', () => {
    render(<DaybreakLanding />)
    expect(screen.queryByText(/checked by a person, every time/i)).toBeNull()
    expect(screen.queryByText(/Human review of every report/i)).toBeNull()
    expect(screen.getByTestId('proof')).toHaveTextContent(/signed off by a licensed Texas attorney/)
    expect(screen.getByText('All six checks')).toBeInTheDocument()
  })

  it('returning customers get a visible Sign in link in the nav', () => {
    render(<DaybreakLanding />)
    expect(screen.getByTestId('nav-signin')).toHaveAttribute('href', '/auth/signin')
    expect(screen.getByTestId('nav-signin')).toHaveTextContent('Sign in')
  })

  it('carries the site-wide legal footer and no urgency theater', () => {
    render(<DaybreakLanding />)
    expect(screen.getByText(/not a law firm and does not provide legal advice/i)).toBeInTheDocument()
    expect(screen.queryByText(/countdown|spots left|act now/i)).toBeNull()
  })
})
