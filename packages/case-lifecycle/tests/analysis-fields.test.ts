import { describe, it, expect } from 'vitest'
import { normalizePreserved, normalizeHarmStandard, vehicleFor, priorityRank, rankIssues, investigationChecklist, hasStructuredFields } from '../analysis-fields'

describe('lenient normalizers — a finding is never rejected for a field', () => {
  it('preservation accepts what a model actually writes', () => {
    expect(normalizePreserved('yes')).toBe('yes')
    expect(normalizePreserved('Preserved — objection overruled')).toBe('yes')
    expect(normalizePreserved(true)).toBe('yes')
    expect(normalizePreserved('partial')).toBe('partial')
    expect(normalizePreserved('Partially preserved (running objection)')).toBe('partial')
    expect(normalizePreserved('no')).toBe('no')
    expect(normalizePreserved('not preserved')).toBe('no')
    expect(normalizePreserved('waived')).toBe('no')
    expect(normalizePreserved(false)).toBe('no')
    expect(normalizePreserved('')).toBe('unknown')
    expect(normalizePreserved(undefined)).toBe('unknown')
    expect(normalizePreserved('¯\\_(ツ)_/¯')).toBe('unknown')
    // The word the prompt asks for must never read as a negative.
    expect(normalizePreserved('unknown')).toBe('unknown')
    expect(normalizePreserved('Unclear from the excerpt')).toBe('unknown')
    expect(normalizePreserved('not determined')).toBe('unknown')
    expect(normalizePreserved('unpreserved')).toBe('no')
  })
  it('harm standard reads the rule the model names', () => {
    expect(normalizeHarmStandard('constitutional')).toBe('constitutional')
    expect(normalizeHarmStandard('TRAP 44.2(a)')).toBe('constitutional')
    expect(normalizeHarmStandard('non-constitutional')).toBe('nonconstitutional')
    expect(normalizeHarmStandard('44.2(b) — evidentiary')).toBe('nonconstitutional')
    expect(normalizeHarmStandard('structural error')).toBe('structural')
    expect(normalizeHarmStandard('')).toBe('none')
    expect(normalizeHarmStandard('n/a')).toBe('none')
  })
})

describe('vehicle is derived, not asked', () => {
  it('a sentence claim goes either way — void sentences are cognizable at any time', () => {
    expect(vehicleFor({ screen: 'sentencing', category: 'unauthorized fine', preserved: 'unknown' })).toBe('either')
    expect(vehicleFor({ screen: 'iac', category: 'illegal_sentence' })).toBe('either')
  })
  it('extra-record and counsel-performance claims go to the writ', () => {
    expect(vehicleFor({ screen: 'iac', category: 'iac', preserved: 'no' })).toBe('writ')
    expect(vehicleFor({ screen: 'brady', category: 'brady', preserved: 'yes' })).toBe('writ')
    expect(vehicleFor({ screen: 'junk_science', category: 'junk_science' })).toBe('writ')
    expect(vehicleFor({ screen: 'brady', category: 'impeachment' })).toBe('writ')
  })
  it('a preserved record claim goes to direct appeal; an unpreserved one only through counsel', () => {
    expect(vehicleFor({ screen: 'preserved_error', category: 'confrontation', preserved: 'yes' })).toBe('direct_appeal')
    expect(vehicleFor({ screen: 'preserved_error', category: 'hearsay', preserved: 'partial' })).toBe('direct_appeal')
    expect(vehicleFor({ screen: 'preserved_error', category: 'jury argument', preserved: 'no' })).toBe('writ')
    expect(vehicleFor({ screen: 'voir_dire', category: 'juror bias', preserved: 'no', harmStandard: 'structural' })).toBe('direct_appeal')
    expect(vehicleFor({ screen: 'identification', category: 'suggestive photo array', preserved: 'unknown' })).toBe('direct_appeal')
  })
})

describe('priority — the order an appellate lawyer sorts a brief', () => {
  const base = { severity: 'supportive', confidence: 0.7 }
  it('severity first, then preservation, then the review standard, then confidence', () => {
    const disp = { ...base, severity: 'dispositive', preserved: 'unknown', screen: 'sentencing', category: 'fine' }
    const presConst = { ...base, preserved: 'yes', harmStandard: 'constitutional', screen: 'preserved_error', category: 'confrontation' }
    const presNon = { ...base, preserved: 'yes', harmStandard: 'nonconstitutional', screen: 'preserved_error', category: 'hearsay' }
    const unpres = { ...base, preserved: 'no', harmStandard: 'constitutional', screen: 'preserved_error', category: 'argument' }
    const order = rankIssues([unpres, presNon, disp, presConst]).map((f) => f.category)
    expect(order).toEqual(['fine', 'confrontation', 'hearsay', 'argument'])
  })
  it('a sentence claim is not penalised for lacking a preservation call', () => {
    const a = priorityRank({ severity: 'dispositive', confidence: 0.7, preserved: 'unknown', screen: 'sentencing', category: 'fine' })
    const b = priorityRank({ severity: 'dispositive', confidence: 0.7, preserved: 'yes', screen: 'preserved_error', category: 'confrontation' })
    expect(a).toBeLessThanOrEqual(b)
  })
  it('confidence only breaks ties', () => {
    const hi = priorityRank({ severity: 'supportive', confidence: 0.9, preserved: 'yes', harmStandard: 'constitutional', screen: 'preserved_error', category: 'x' })
    const lo = priorityRank({ severity: 'supportive', confidence: 0.3, preserved: 'yes', harmStandard: 'constitutional', screen: 'preserved_error', category: 'x' })
    expect(hi).toBeLessThan(lo)
    expect(Math.floor(hi / 10)).toBe(Math.floor(lo / 10))
  })
})

describe('investigation checklist', () => {
  it('orders by priority and folds near-duplicate asks', () => {
    const list = investigationChecklist([
      { severity: 'background', confidence: 0.4, develop: 'Obtain the Volume 6 exhibits.', screen: 'iac', category: 'x' },
      { severity: 'dispositive', confidence: 0.9, develop: 'Obtain the judgment and sentence for each count.', screen: 'sentencing', category: 'fine' },
      { severity: 'supportive', confidence: 0.6, develop: 'obtain the volume 6 exhibits', screen: 'brady', category: 'y' },
      { severity: 'supportive', confidence: 0.6, develop: '', screen: 'brady', category: 'z' },
    ])
    expect(list).toEqual(['Obtain the judgment and sentence for each count.', 'Obtain the volume 6 exhibits.'])
  })
  it('caps the list', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ severity: 'supportive', confidence: 0.5, develop: `Step ${i}`, screen: 'iac', category: 'x' }))
    expect(investigationChecklist(many)).toHaveLength(25)
  })
})

describe('older snapshots render as before', () => {
  it('a v1 finding has no structured fields', () => {
    expect(hasStructuredFields({})).toBe(false)
    expect(hasStructuredFields({ dependsOn: [] })).toBe(false)
    expect(hasStructuredFields({ preserved: 'yes' })).toBe(true)
  })
})
