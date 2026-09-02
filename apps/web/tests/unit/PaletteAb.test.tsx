/** Funnel analytics (color_research_landing.md §5) — palette fixed to harbor; capture + CTA events. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { getPaletteVariant, captureAb } from '../../lib/ab'
import CtaLink from '../../components/ab/CtaLink'

beforeEach(() => window.localStorage.clear())

describe('getPaletteVariant (A/B retired 2026-09-02)', () => {
  it('is fixed to harbor — no assignment, no storage, no ?palette override', () => {
    window.history.pushState({}, '', '/?palette=amber')
    expect(getPaletteVariant()).toBe('harbor')
    expect(window.localStorage.getItem('snl_palette')).toBeNull()
    window.history.pushState({}, '', '/')
  })
})

describe('captureAb', () => {
  it('is a silent no-op without a key and never throws', () => {
    delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_POSTHOG_KEY
    expect(() => captureAb('snl.landing_view', { palette: 'amber' })).not.toThrow()
  })
})

describe('CtaLink', () => {
  it('renders the link and fires the conversion capture on click', () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_test'
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'))
    window.localStorage.setItem('snl_palette', 'harbor')
    render(
      <CtaLink href="/check" position="hero" className="x">
        Go
      </CtaLink>
    )
    fireEvent.click(screen.getByText('Go'))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))
    expect(body.event).toBe('snl.check_cta_click')
    expect(body.properties.palette).toBe('harbor')
    expect(body.properties.position).toBe('hero')
    fetchSpy.mockRestore()
    delete (process.env as Record<string, string | undefined>).NEXT_PUBLIC_POSTHOG_KEY
  })
})
