import React from 'react'
import { describe, it, expect, vi } from 'vitest'
vi.mock('next/navigation', () => ({ useParams: () => ({ slug: 'what-is-an-11-07-writ' }) }))
import { render, screen } from '@testing-library/react'
import BrandHome from '@/app/(daybreak)/page'
import Pricing from '@/app/(daybreak)/pricing/page'
import About from '@/app/(daybreak)/about/page'

/** Brand site P1 (snotnoselegal_site_design.md): the calm front door — full
 * nav, trust block, honesty filter; pricing tells the whole money story. */
describe('brand site (P1)', () => {
  it('home renders hero, nav, trust block, and the honesty filter — CTA to the free check', () => {
    render(<BrandHome />)
    expect(screen.getByRole('heading', { name: /what.s really in it/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing')
    expect(screen.getByTestId('nav-signin')).toHaveAttribute('href', '/auth/signin')
    expect(screen.getByText(/re-checked against your documents/)).toBeInTheDocument()
    expect(screen.getByText(/This is not for every case/)).toBeInTheDocument()
    expect(screen.getByText(/don.t sell hope/)).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: /free/i }).filter((l) => l.getAttribute('href') === '/check')
    expect(ctas.length).toBeGreaterThanOrEqual(2)
  })

  it('pricing states the whole money story: $299, $49 overage, $99 re-run, and what is always free', () => {
    render(<Pricing />)
    expect(screen.getByRole('heading', { name: /One price: \$299/ })).toBeInTheDocument()
    expect(screen.getByText(/\+\$49 per extra 2,500 pages/)).toBeInTheDocument()
    expect(screen.getByText(/\$99 — only if you find NEW documents/)).toBeInTheDocument()
    expect(screen.getByText(/take weeks if you need to/)).toBeInTheDocument()
    expect(screen.queryByText(/countdown|spots left|act now/i)).toBeNull() // no urgency theater
  })

  it('about keeps the UPL line front and center', () => {
    render(<About />)
    expect(screen.getByText(/not a law firm, we do not give legal advice/)).toBeInTheDocument()
    expect(screen.getByText(/Tangent Solutions LLC/)).toBeInTheDocument()
  })
})

import LearnHub from '@/app/(daybreak)/learn/page'
import HowItWorks from '@/app/(daybreak)/how-it-works/page'

describe('brand site (P2)', () => {
  it('learn hub lists the guide + all four articles, each with the disclaimer stance', () => {
    render(<LearnHub />)
    expect(screen.getByRole('link', { name: /How to get the court documents/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /11\.07 writ/ })).toHaveAttribute('href', '/learn/what-is-an-11-07-writ')
    expect(screen.getByRole('link', { name: /one-year deadline/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /first writ matters/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ineffective assistance/ })).toBeInTheDocument()
    expect(screen.getByText(/not legal advice/)).toBeInTheDocument()
  })

  it('how-it-works narrates the five stages and both report parts, with the 10-day promise', () => {
    render(<HowItWorks />)
    expect(screen.getByText(/1 · The free check/)).toBeInTheDocument()
    expect(screen.getByText(/5 · Quality gates/)).toBeInTheDocument()
    expect(screen.getByText(/10 business days/)).toBeInTheDocument()
    expect(screen.getByText(/Part A — for your family/)).toBeInTheDocument()
    expect(screen.getByText(/Part B — for the lawyer/)).toBeInTheDocument()
  })
})


import LearnArticle from '@/app/(daybreak)/learn/[slug]/page'

describe('learn article', () => {
  it('renders sections, the disclaimer, and the CTA', () => {
    render(<LearnArticle />)
    expect(screen.getByRole('heading', { name: /What is an 11\.07 writ/ })).toBeInTheDocument()
    expect(screen.getByText(/not a second appeal/)).toBeInTheDocument()
    expect(screen.getByText(/not legal advice/)).toBeInTheDocument()
    const ctas = screen.getAllByRole('link', { name: /Start the free check/ })
    expect(ctas.length).toBeGreaterThanOrEqual(2) // nav + article footer
    expect(ctas.every((l) => l.getAttribute('href') === '/check')).toBe(true)
  })
})


import SampleReport from '@/app/(daybreak)/sample-report/page'

describe('sample report', () => {
  it('leads with the fictional banner and mirrors the real report anatomy', () => {
    render(<SampleReport />)
    const banner = screen.getByTestId('sample-banner')
    expect(banner).toHaveTextContent(/fictional case/)
    expect(banner).toHaveTextContent(/invented/)
    expect(screen.getByText(/never contacted her/)).toBeInTheDocument() // Part A voice
    expect(screen.getByText(/RR4:212/)).toBeInTheDocument() // Part B cites
    expect(screen.getAllByText(/For your lawyer \(Part B\)/).length).toBe(3)
    expect(screen.getByText(/And when we find nothing\?/)).toBeInTheDocument()
  })
})
