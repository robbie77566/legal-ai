import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { STEP_STATUS_LABEL, MISSED_JURISDICTIONAL_BANNER } from '@hg/case-lifecycle'
import TrapClockCard, { type TrapClockView } from '@/components/counsel/TrapClockCard'

/**
 * U5-c — the TRAP clock card's wording (UPL review 2026-10-23, P8): a step
 * past its due date is "Appears missed on the dates given", never "Missed";
 * the banner says to verify with the rules in force; the proposed-vectors
 * line names who signs them. The labels are the engine's own so the card and
 * the packet agree.
 */
const step = (over: Partial<TrapClockView['steps'][number]>): TrapClockView['steps'][number] => ({
  id: 'noa',
  rule: 'TRAP 26.2',
  subdivision: '(a)(1)',
  label: 'Notice of appeal',
  due: '2026-10-01',
  status: 'open',
  late: false,
  jurisdictional: true,
  isExtension: false,
  optional: false,
  basis: 'TRAP 26.2(a)(1): 30 days after sentencing (2026-09-01).',
  ...over,
})

const clock = (over: Partial<TrapClockView> = {}): TrapClockView => ({
  vehicle: 'direct_appeal',
  asOf: '2026-10-19',
  steps: [step({})],
  missedJurisdictional: false,
  unsignedCount: 1,
  notes: [],
  ...over,
})

describe('<TrapClockCard />', () => {
  it('labels a missed step "Appears missed on the dates given" and never prints "Missed"', () => {
    render(<TrapClockCard clock={clock({ steps: [step({ id: 'noa', status: 'missed' }), step({ id: 'brief', status: 'done', late: true, jurisdictional: false })], missedJurisdictional: true })} />)
    expect(screen.getByTestId('trap-step-noa')).toHaveTextContent('Appears missed on the dates given')
    expect(screen.getByTestId('trap-step-brief')).toHaveTextContent('Filed late')
    expect(screen.getByTestId('trap-clock').textContent).not.toMatch(/\bMissed\b/)
    expect(STEP_STATUS_LABEL.missed).toBe('Appears missed on the dates given')
  })

  it('the banner says to verify at once with the rules in force, and only when a jurisdictional step appears missed', () => {
    const { unmount } = render(<TrapClockCard clock={clock({ steps: [step({ status: 'missed' })], missedJurisdictional: true })} />)
    expect(screen.getByTestId('trap-missed')).toHaveTextContent(MISSED_JURISDICTIONAL_BANNER)
    expect(screen.getByTestId('trap-missed')).toHaveTextContent('verify at once with the rules in force')
    unmount()
    render(<TrapClockCard clock={clock()} />)
    expect(screen.queryByTestId('trap-missed')).toBeNull()
  })

  it('says who signs the proposed vectors — a Texas appellate lawyer, in the rule table — not the reader', () => {
    render(<TrapClockCard clock={clock({ unsignedCount: 3, steps: [step({}), step({ id: 'record' }), step({ id: 'brief' })] })} />)
    const d = screen.getByTestId('trap-disclaimer')
    expect(d).toHaveTextContent('3 of these vectors are proposed until a Texas appellate lawyer signs them in our rule table.')
    expect(d).toHaveTextContent('verify it against the rules in force')
    expect(d.textContent).not.toMatch(/until you sign|until counsel signs/)
  })
})
