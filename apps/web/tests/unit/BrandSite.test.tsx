import React from 'react'
import { describe, it, expect } from 'vitest'
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
    expect(screen.getByText(/Tangent Software LLC/)).toBeInTheDocument()
  })
})
