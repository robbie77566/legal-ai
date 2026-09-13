import React from 'react'
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { BrandLockup } from '@/components/daybreak/BrandLogo'

/** Readability rule (2026-09-13): the highlighter never sits behind glyphs —
 *  the price on the home page was unreadable in dark mode (1.07:1). */
describe('highlighter stroke', () => {
  it('is an underline below the baseline, not a background behind the text', () => {
    const css = readFileSync(join(__dirname, '..', '..', 'app', '(daybreak)', 'daybreak.css'), 'utf8')
    const block = css.slice(css.indexOf('.daybreak .db-hl'))
    const rule = block.slice(0, block.indexOf('}'))
    expect(rule).toContain('text-decoration-line: underline')
    expect(rule).toContain('text-underline-offset: 0.18em')
    expect(rule).not.toContain('background')
  })
  it('the lockup\'s LEGAL uses the same stroke and no background', () => {
    render(<BrandLockup />)
    const legal = screen.getByText('LEGAL')
    expect(legal.className).toContain('db-hl')
    expect(legal.style.backgroundImage).toBe('')
  })
})
