import { describe, it, expect } from 'vitest'
import { trackerModel } from '@/lib/tracker'
import { customerView } from '@hg/case-lifecycle'

describe('tracker view-model (UI spec §5.6)', () => {
  it('is pre-clock while awaiting documents', () => {
    expect(trackerModel(customerView('AWAITING_DOCS', [])).activeIndex).toBe(-1)
  })

  it('maps internal states onto the five honest stages', () => {
    expect(trackerModel(customerView('DOCS_COMPLETE', [])).activeIndex).toBe(0)
    expect(trackerModel(customerView('DIGITIZING', [])).activeIndex).toBe(1)
    expect(trackerModel(customerView('ANALYZING', [])).activeIndex).toBe(2)
    // internal loops never leak
    expect(trackerModel(customerView('ADJUDICATING', [])).activeIndex).toBe(2)
    expect(trackerModel(customerView('QA_REJECTED', [])).activeIndex).toBe(3)
    expect(trackerModel(customerView('READY', [])).activeIndex).toBe(4)
    expect(trackerModel(customerView('DELIVERED', [])).delivered).toBe(true)
  })

  it('renders honest hold overlays — OCR halt outranks delay-ours', () => {
    const m = trackerModel(customerView('DIGITIZING', ['OCR_HALT', 'DELAY_OURS']))
    expect(m.overlayCopy).toMatch(/help with some pages/)
    const d = trackerModel(customerView('ANALYZING', ['DELAY_OURS']))
    expect(d.overlayCopy).toMatch(/on us, not your clock/)
  })

  it('says truthfully how the report is checked — never a "legal reviewer" (UPL review 2026-10-23)', () => {
    const copy = trackerModel(customerView('QA_REVIEW', [])).qualityReviewCopy
    expect(copy).toContain('Checked by automated quality gates and by our review staff when anything looks off.')
    expect(copy).toMatch(/24 hours/)
    expect(copy).not.toMatch(/legal reviewer/i)
  })
})
