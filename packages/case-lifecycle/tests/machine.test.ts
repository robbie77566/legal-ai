import { describe, it, expect } from 'vitest'
import {
  CASE_STATUSES,
  assertTransition,
  isLegalTransition,
  legalTransitions,
  IllegalTransitionError,
  customerView,
  validateEventPayload,
  UnknownCaseEventError,
  CASE_EVENT_TYPES,
  CASE_EVENT_SCHEMAS,
} from '../index'

describe('case state machine (ENG-1)', () => {
  it('walks the happy path end to end', () => {
    const path = [
      'DRAFT',
      'AWAITING_DOCS',
      'DOCS_COMPLETE',
      'DIGITIZING',
      'ANALYZING',
      'ADJUDICATING',
      'QA_REVIEW',
      'READY',
      'DELIVERED',
    ] as const
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertTransition(path[i], path[i + 1])).not.toThrow()
    }
  })

  it('QA rejection loops back to ANALYZING or QA_REVIEW only', () => {
    expect(isLegalTransition('QA_REVIEW', 'QA_REJECTED')).toBe(true)
    expect(isLegalTransition('QA_REJECTED', 'ANALYZING')).toBe(true)
    expect(isLegalTransition('QA_REJECTED', 'QA_REVIEW')).toBe(true)
    expect(isLegalTransition('QA_REJECTED', 'READY')).toBe(false)
  })

  it('throws IllegalTransitionError on skips and reversals', () => {
    expect(() => assertTransition('DRAFT', 'ANALYZING')).toThrow(IllegalTransitionError)
    expect(() => assertTransition('DELIVERED', 'ANALYZING')).toThrow(IllegalTransitionError)
    expect(() => assertTransition('ANALYZING', 'DRAFT')).toThrow(IllegalTransitionError)
  })

  it('REFUNDED is reachable from everywhere except DELETED; DELETED from everywhere but itself', () => {
    for (const s of CASE_STATUSES) {
      if (s === 'DELETED') {
        expect(legalTransitions(s)).toHaveLength(0)
        continue
      }
      expect(isLegalTransition(s, 'DELETED')).toBe(true)
      if (s !== 'REFUNDED') expect(isLegalTransition(s, 'REFUNDED')).toBe(true)
    }
  })
})

describe('customer-visible mapping (UI spec §5.6)', () => {
  it('hides internal loops: ADJUDICATING reads as analyzing, QA_REJECTED as quality_review', () => {
    expect(customerView('ADJUDICATING', []).stage).toBe('analyzing')
    expect(customerView('QA_REJECTED', []).stage).toBe('quality_review')
  })

  it('holds overlay the stage, never replace it; OCR halt outranks delay-ours', () => {
    const v = customerView('DIGITIZING', ['OCR_HALT', 'DELAY_OURS'])
    expect(v.stage).toBe('digitizing')
    expect(v.overlay).toBe('needs_your_help')
    expect(customerView('ANALYZING', ['DELAY_OURS']).overlay).toBe('delay_ours')
  })
})

describe('event registry (§11a.5 — PII-minimal, versioned, strict)', () => {
  it('accepts a valid payload', () => {
    expect(
      validateEventPayload('docs.complete', 1, { billablePages: 2140, duplicatesIgnored: 12 })
    ).toEqual({ billablePages: 2140, duplicatesIgnored: 12 })
  })

  it('rejects unknown keys — free text can never ride along', () => {
    expect(() =>
      validateEventPayload('docs.complete', 1, {
        billablePages: 1,
        duplicatesIgnored: 0,
        note: 'the defendant said…',
      })
    ).toThrow()
  })

  it('rejects unknown types and versions', () => {
    expect(() => validateEventPayload('made.up', 1, {})).toThrow(UnknownCaseEventError)
    expect(() => validateEventPayload('docs.complete', 2, {})).toThrow(UnknownCaseEventError)
  })

  it('every registered schema is strict (structural PII guard)', () => {
    for (const type of CASE_EVENT_TYPES) {
      const versions = CASE_EVENT_SCHEMAS[type] as Record<number, { parse: (v: unknown) => unknown }>
      for (const v of Object.keys(versions)) {
        // Injecting a junk key into an otherwise-empty object must throw for
        // object schemas; strictness is the contract.
        expect(
          () => versions[Number(v)].parse({ __pii_smuggle__: 'x' }),
          `${type} v${v} must be strict`
        ).toThrow()
      }
    }
  })
})
