import { describe, it, expect } from 'vitest'
import { normalizeCivilDate } from '../civil-date'

/** Sentry 2026-09-12: a judgment date that was not YYYY-MM-DD became a
 *  ZodError whose message was the regex's name. Accept what people type. */
describe('normalizeCivilDate', () => {
  it('passes ISO through and normalizes the common US shapes', () => {
    expect(normalizeCivilDate('2019-09-12')).toBe('2019-09-12')
    expect(normalizeCivilDate(' 2019-09-12 ')).toBe('2019-09-12')
    expect(normalizeCivilDate('9/12/2019')).toBe('2019-09-12')
    expect(normalizeCivilDate('09/12/2019')).toBe('2019-09-12')
    expect(normalizeCivilDate('09-12-2019')).toBe('2019-09-12')
    expect(normalizeCivilDate('2019/9/12')).toBe('2019-09-12')
    expect(normalizeCivilDate('September 12, 2019')).toBe('2019-09-12')
    expect(normalizeCivilDate('Sept 12 2019')).toBe('2019-09-12')
    expect(normalizeCivilDate('12 September 2019')).toBe('2019-09-12')
  })
  it('blank means not given', () => {
    expect(normalizeCivilDate('')).toBeUndefined()
    expect(normalizeCivilDate('   ')).toBeUndefined()
    expect(normalizeCivilDate(null)).toBeUndefined()
    expect(normalizeCivilDate(undefined)).toBeUndefined()
  })
  it('leaves the unreadable alone so the schema refuses it with a human message', () => {
    expect(normalizeCivilDate('last spring')).toBe('last spring')
    expect(normalizeCivilDate('13/40/2019')).toBe('13/40/2019')
    expect(normalizeCivilDate('2019')).toBe('2019')
    expect(normalizeCivilDate(20190912)).toBe(20190912)
  })
})
