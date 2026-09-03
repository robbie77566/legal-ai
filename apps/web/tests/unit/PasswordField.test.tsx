import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PasswordField, { PASSWORD_RULES } from '@/components/daybreak/PasswordField'

function Harness() {
  const [v, setV] = React.useState('')
  return <PasswordField label="Password" value={v} onChange={setV} />
}

describe('PasswordField (buy/account step)', () => {
  it('reveals the typed password on demand', () => {
    render(<Harness />)
    const input = screen.getByTestId('password-input') as HTMLInputElement
    expect(input.type).toBe('password')
    fireEvent.click(screen.getByTestId('password-toggle'))
    expect(input.type).toBe('text')
    expect(screen.getByTestId('password-toggle')).toHaveTextContent('Hide')
  })

  it('shows the three server rules live, turning each green as it is met', () => {
    render(<Harness />)
    const input = screen.getByTestId('password-input')
    const items = () => Array.from(screen.getByTestId('password-rules').querySelectorAll('li')).map((li) => li.getAttribute('data-ok'))
    expect(items()).toEqual(['false', 'false', 'false'])
    fireEvent.change(input, { target: { value: 'lowercaseonly' } }) // 13 chars, no upper, no digit
    expect(items()).toEqual(['true', 'false', 'false'])
    fireEvent.change(input, { target: { value: 'Deertrail77566!' } })
    expect(items()).toEqual(['true', 'true', 'true'])
  })

  it('mirrors the API schema exactly (12+, uppercase, number-or-symbol)', () => {
    const ok = (v: string) => PASSWORD_RULES.every((r) => r(v))
    expect(ok('Short1!')).toBe(false)
    expect(ok('twelvecharslong')).toBe(false)
    expect(ok('TwelveCharsLong')).toBe(false)
    expect(ok('TwelveCharsLong1')).toBe(true)
    expect(ok('TwelveCharsLong!')).toBe(true)
  })
})
