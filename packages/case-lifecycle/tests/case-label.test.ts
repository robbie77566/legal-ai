import { describe, it, expect } from 'vitest'
import { caseLabel, caseRef, caseLabelWithRef, caseMatchesTerm, isPlaceholderTitle } from '../case-label'

/**
 * The bug these guard against: `Case.title` is the constant 'Case review', so
 * every staff queue row read identically and the type-the-title delete
 * confirmation unlocked on any case.
 */
describe('case label', () => {
  it('names a case by its conviction, as the family sees it', () => {
    expect(caseLabel({ county: 'Harris', convictionYear: 2019 })).toBe('Harris County · 2019')
  })

  it('degrades a piece at a time rather than going blank', () => {
    expect(caseLabel({ county: 'Bexar' })).toBe('Bexar County')
    expect(caseLabel({ convictionYear: 2004 })).toBe('2004 conviction')
    expect(caseLabel({ createdAt: new Date('2026-09-15T12:00:00Z') })).toBe('Review started 2026-09-15')
    expect(caseLabel({})).toBe('Review')
  })

  it('accepts a serialized date, since API payloads carry strings', () => {
    expect(caseLabel({ createdAt: '2026-09-15T12:00:00.000Z' })).toBe('Review started 2026-09-15')
    expect(caseLabel({ createdAt: 'not-a-date' })).toBe('Review')
  })

  it('never returns the same label for two different conviction records', () => {
    expect(caseLabel({ county: 'Harris', convictionYear: 2019 })).not.toBe(
      caseLabel({ county: 'Harris', convictionYear: 2020 })
    )
  })
})

describe('case reference', () => {
  it('is short, uppercase, and speakable over the phone', () => {
    expect(caseRef('clq2x8k9k0000abc7f3')).toBe('ABC7F3')
    expect(caseRef('clq2x8k9k0000abc7f3q')).toHaveLength(6)
  })

  it('distinguishes cases that share a county and year — the delete guard depends on it', () => {
    const a = 'clq2x8k9k0000aaaaaa'
    const b = 'clq2x8k9k0000bbbbbb'
    expect(caseRef(a)).not.toBe(caseRef(b))
  })

  it('has something to render for a missing id', () => {
    expect(caseRef(null)).toBe('—')
    expect(caseRef(undefined)).toBe('—')
  })
})

describe('staff search', () => {
  const kase = { id: 'clq2x8k9k0000abc7f3', county: 'Harris', convictionYear: 2019 }

  it('matches the county, the reference, and the raw id', () => {
    expect(caseMatchesTerm(kase, 'harris')).toBe(true)
    expect(caseMatchesTerm(kase, 'abc7f3')).toBe(true)
    expect(caseMatchesTerm(kase, 'ABC7F3')).toBe(true)
    expect(caseMatchesTerm(kase, 'clq2x8')).toBe(true)
    expect(caseMatchesTerm(kase, '2019')).toBe(true)
  })

  it('does not match an unrelated term, and an empty term matches everything', () => {
    expect(caseMatchesTerm(kase, 'dallas')).toBe(false)
    expect(caseMatchesTerm(kase, '   ')).toBe(true)
  })
})

describe('label with reference', () => {
  it('reads as one line for a staff surface', () => {
    expect(caseLabelWithRef({ id: 'clq2x8k9k0000abc7f3', county: 'Harris', convictionYear: 2019 }))
      .toBe('Harris County · 2019 · ABC7F3')
  })
})

describe('a real title wins; the placeholder never does', () => {
  it('ignores the purchase-time placeholders and derives from the conviction', () => {
    for (const t of ['Case review', 'Family Case Review', 'case review', ' Review ']) {
      expect(caseLabel({ title: t, county: 'Harris', convictionYear: 2019 })).toBe('Harris County · 2019')
    }
  })
  it('keeps a title that actually names the case — seeded fixtures, counsel-named matters', () => {
    expect(caseLabel({ title: 'Whitfield — Travis County record', county: 'Harris', convictionYear: 2019 })).toBe('Whitfield — Travis County record')
    expect(caseLabel({ title: 'money_123 Travis County record' })).toBe('money_123 Travis County record')
  })
  it('classifies placeholders', () => {
    expect(isPlaceholderTitle('Case review')).toBe(true)
    expect(isPlaceholderTitle(null)).toBe(true)
    expect(isPlaceholderTitle('State v. Ortiz')).toBe(false)
  })
})
