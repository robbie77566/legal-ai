import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Brand icon (2026-09-13): the logo's serif L + highlighter + pixel trail,
 *  shipped as the app-router metadata files so every tab and home screen
 *  carries the mark. Geometry is shared by icon.svg and scripts/brand-icon.py. */
const app = join(__dirname, '..', '..', 'app')
describe('brand icon files', () => {
  it('icon.svg carries the brand colors and the mark', () => {
    const svg = readFileSync(join(app, 'icon.svg'), 'utf8')
    expect(svg).toContain('#e6ff3b') // highlighter
    expect(svg).toContain('#2b2f36') // charcoal L
    expect(svg).toContain('aria-label="Snot Nose Legal"')
  })
  it('favicon.ico holds 16, 32 and 48 px; apple-icon.png is 180 px', () => {
    const ico = readFileSync(join(app, 'favicon.ico'))
    expect(ico.readUInt16LE(4)).toBe(3)
    const sizes = [0, 1, 2].map((i) => `${ico[6 + 16 * i] || 256}x${ico[7 + 16 * i] || 256}`).sort()
    expect(sizes).toEqual(['16x16', '32x32', '48x48'])
    const png = readFileSync(join(app, 'apple-icon.png'))
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(180) // IHDR width
    expect(png.readUInt32BE(20)).toBe(180)
  })
})
