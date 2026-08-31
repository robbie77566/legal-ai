/** Palette A/B (color_research_landing.md §5): assignment, persistence, capture. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { getPaletteVariant, captureAb } from '../../lib/ab'
import CtaLink from '../../components/ab/CtaLink'

beforeEach(() => window.localStorage.clear())

describe('getPaletteVariant', () => {
  it('assigns 50/50 and persists the first assignment', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.9)
    expect(getPaletteVariant()).toBe('harbor')
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1)
    expect(getPaletteVariant()).toBe('harbor') // persisted, not re-rolled
    expect(window.localStorage.getItem('snl_palette')).toBe('harbor')
  })

  it('defaults to the incumbent amber when storage throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(getPaletteVariant()).toBe('amber')
    spy.mockRestore()
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
