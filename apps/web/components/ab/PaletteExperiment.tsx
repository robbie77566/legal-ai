'use client'

import { useEffect } from 'react'
import { getPaletteVariant, captureAb } from '../../lib/ab'

/**
 * Applies the assigned palette to the Daybreak root (funnel-wide, so the
 * scheme never flips between landing and checkout) and, on the landing
 * page only (pingView), records the exposure event that anchors the
 * conversion funnel: snl.landing_view → snl.check_cta_click.
 */
export default function PaletteExperiment({ pingView = false }: { pingView?: boolean }) {
  useEffect(() => {
    const palette = getPaletteVariant()
    document.querySelector('.daybreak')?.setAttribute('data-palette', palette)
    if (pingView) captureAb('snl.landing_view', { palette })
  }, [pingView])
  return null
}
