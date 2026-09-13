'use client'

/**
 * The brand mark (docs/design/brand.md). Renders /brand/logo.png — the
 * hand-lettered "Snot Nose" over a highlighted "LEGAL" — and, until that
 * file is in place (or if it fails to load), a typographic lockup in the
 * same spirit: marker script, heavy serif, a highlighter stroke.
 */
import Link from 'next/link'
import { useState } from 'react'
import { BRAND } from '@hg/case-lifecycle'

const SIZES = { nav: 36, hero: 88, auth: 64, small: 28 } as const

export function BrandLockup({ size = 'nav', tagline = false }: { size?: keyof typeof SIZES; tagline?: boolean }) {
  const h = SIZES[size]
  const script = Math.round(h * 0.52)
  const serif = Math.round(h * 0.5)
  return (
    <span className="inline-flex flex-col leading-none" data-testid="brand-lockup" aria-label={BRAND.name}>
      <span className="font-db-marker text-db-ink" style={{ fontSize: script }}>Snot Nose</span>
      <span
        className="font-db-serif font-bold tracking-wide text-db-charcoal"
        style={{ fontSize: serif, marginTop: -Math.round(h * 0.06), backgroundImage: 'linear-gradient(transparent 55%, var(--db-highlight) 55%, var(--db-highlight) 92%, transparent 92%)' }}
      >
        LEGAL
      </span>
      {tagline && <span className="mt-1 font-db-sans text-xs text-db-muted">{BRAND.tagline}</span>}
    </span>
  )
}

export default function BrandLogo({ size = 'nav', href = '/', tagline = false, className = '' }: { size?: keyof typeof SIZES; href?: string | null; tagline?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false)
  const h = SIZES[size]
  const inner = broken ? (
    <BrandLockup size={size} tagline={tagline} />
  ) : (
    <span className="inline-flex flex-col items-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset, no optimizer */}
      <img src="/brand/logo.png" alt={`${BRAND.name} — ${BRAND.tagline}`} height={h} style={{ height: h, width: 'auto' }} onError={() => setBroken(true)} data-testid="brand-logo" />
      {tagline && <span className="mt-1 font-db-sans text-xs text-db-muted">{BRAND.tagline}</span>}
    </span>
  )
  if (!href) return <span className={className}>{inner}</span>
  return <Link href={href} className={`inline-block ${className}`} aria-label={`${BRAND.name} home`}>{inner}</Link>
}
