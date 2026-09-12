import { describe, it, expect } from 'vitest'
import config from '../../next.config.mjs'

/** GHSA-2xp9-vwfh-vxw4 (2026-09-12): the image optimizer endpoint must stay
 *  closed (Next 14 answers /_next/image with 404 when unoptimized) until the
 *  Next ≥ 15.5.24 upgrade — see docs/operations/dependency_audit.md. */
describe('next.config', () => {
  it('keeps the Image Optimization API disabled', () => {
    expect((config as { images?: { unoptimized?: boolean } }).images?.unoptimized).toBe(true)
  })
})
