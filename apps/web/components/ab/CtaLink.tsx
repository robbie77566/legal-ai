'use client'

import Link from 'next/link'
import { getPaletteVariant, captureAb } from '../../lib/ab'

/** Landing CTA with conversion capture (primary A/B metric). */
export default function CtaLink({
  href,
  position,
  className,
  children,
}: {
  href: string
  position: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => captureAb('snl.check_cta_click', { palette: getPaletteVariant(), position })}
    >
      {children}
    </Link>
  )
}
