import { describe, it, expect } from 'vitest'
import { summaryRows, CaseSummarySchema } from '../summary'

describe('case summary rows', () => {
  it('a record-cited fact wins, family facts fill gaps and say so, unknowns are null', () => {
    const rows = summaryRows(
      { defendant: { value: 'GARY W. DOE', cite: { volume: 'RR1', page: 3, quote: 'THE STATE OF TEXAS VS. GARY W. DOE' } }, county: null },
      { county: 'Brazoria', convictionYear: 2019, trialOrPlea: 'trial', appeal: 'decided', priorWrit: 'no' }
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.defendant).toMatchObject({ value: 'GARY W. DOE', source: 'record', cite: { volume: 'RR1', page: 3 } })
    expect(by.county).toMatchObject({ value: 'Brazoria County', source: 'family' })
    expect(by.verdict).toMatchObject({ value: 'Convicted at trial', source: 'family' })
    expect(by.appeal).toMatchObject({ value: 'A direct appeal was decided', source: 'family' })
    expect(by.priorWrits).toMatchObject({ value: 'None', source: 'family' })
    expect(by.judgmentDate).toMatchObject({ value: '2019', source: 'family' })
    expect(by.offense).toEqual({ key: 'offense', label: 'Offense', value: null, source: null })
    expect(rows.map((r) => r.label)[0]).toBe('Person')
  })
  it('the schema is strict: unknown keys and quote-less facts are rejected', () => {
    expect(CaseSummarySchema.safeParse({ defendant: { value: 'X', cite: { quote: 'THE STATE OF TEXAS VS. X' } }, extra: 1 }).success).toBe(false)
    expect(CaseSummarySchema.safeParse({ defendant: { value: 'X' } }).success).toBe(false)
    expect(CaseSummarySchema.safeParse({ defendant: null, offense: { value: 'Murder', cite: { volume: null, page: 4, quote: 'the offense of Murder' } } }).success).toBe(true)
  })
})
