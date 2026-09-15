import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AccountAdmin from '@/app/ops/accounts/page'
import { formatDuration, formatWhen } from '@/lib/duration'

const ACCOUNTS = [
  { id: 'u1', email: 'maria@example.com', name: 'Maria Delgado', createdAt: '2026-08-01T10:00:00Z', deletedAt: null, cases: 1,
    lastLoginAt: '2026-09-15T14:05:00Z', loginCount: 7, visits: 12, avgSecondsOnSite: 385, lastSeenAt: '2026-09-15T14:20:00Z' },
  { id: 'u2', email: 'never@example.com', name: null, createdAt: '2026-09-10T10:00:00Z', deletedAt: null, cases: 0,
    lastLoginAt: null, loginCount: 0, visits: 0, avgSecondsOnSite: null, lastSeenAt: null },
]
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ACCOUNTS }) as Response))
})

describe('accounts page — activity', () => {
  it('shows last sign-in with the count, visits with last seen, and average time on site', async () => {
    render(<AccountAdmin />)
    const login = await screen.findByTestId('last-login-u1')
    expect(login).toHaveTextContent('Sep 15, 2026')
    expect(login).toHaveTextContent('7 sign-ins')
    expect(screen.getByTestId('visits-u1')).toHaveTextContent('12')
    expect(screen.getByTestId('visits-u1')).toHaveTextContent(/last seen/)
    expect(screen.getByTestId('avg-time-u1')).toHaveTextContent('6m 25s')
  })
  it('an account that has never signed in says so, without inventing numbers', async () => {
    render(<AccountAdmin />)
    expect(await screen.findByTestId('last-login-u2')).toHaveTextContent('never')
    expect(screen.getByTestId('last-login-u2')).not.toHaveTextContent(/sign-in/)
    expect(screen.getByTestId('visits-u2')).toHaveTextContent('0')
    expect(screen.getByTestId('avg-time-u2')).toHaveTextContent('—')
  })
})

describe('duration formatting', () => {
  it('reads like a person would say it', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(180)).toBe('3m')
    expect(formatDuration(385)).toBe('6m 25s')
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(4320)).toBe('1h 12m')
    expect(formatDuration(null)).toBe('—')
  })
  it('never happened reads as never', () => {
    expect(formatWhen(null)).toBe('never')
    expect(formatWhen('not a date')).toBe('never')
  })
})
