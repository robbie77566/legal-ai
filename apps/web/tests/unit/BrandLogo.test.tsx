import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BrandLogo, { BrandLockup } from '@/components/daybreak/BrandLogo'

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

/** Brand (2026-09-13): the logo file when it exists, the lockup otherwise — never a blank. */
describe('BrandLogo', () => {
  it('renders the logo image with the brand and tagline as alt text, linked home', () => {
    render(<BrandLogo />)
    const img = screen.getByTestId('brand-logo') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/brand/logo.png')
    expect(img.alt).toBe('Snot Nose Legal — Post-Conviction Case File Analytics')
    expect(img.closest('a')).toHaveAttribute('href', '/')
  })
  it('falls back to the typographic lockup when the file is missing', () => {
    render(<BrandLogo tagline />)
    fireEvent.error(screen.getByTestId('brand-logo'))
    const lockup = screen.getByTestId('brand-lockup')
    expect(lockup).toHaveTextContent('Snot Nose')
    expect(lockup).toHaveTextContent('LEGAL')
    expect(lockup).toHaveTextContent('Post-Conviction Case File Analytics')
  })
  it('the lockup alone carries the accessible name', () => {
    render(<BrandLockup size="hero" />)
    expect(screen.getByLabelText('Snot Nose Legal')).toBeInTheDocument()
  })
})
