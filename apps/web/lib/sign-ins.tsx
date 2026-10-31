/** Sign-in outcomes as a staff member reads them (staff_console.md §12 "Sign-in log and alerts"). */
import type { SignInFilter, SignInOutcome } from '@/lib/api'

export const OUTCOME_LABEL: Record<SignInFilter, string> = {
  SUCCESS: 'signed in',
  FAILED: 'failed (any reason)',
  BAD_PASSWORD: 'wrong password',
  UNKNOWN_EMAIL: 'no such account',
  RATE_LIMITED: 'rate-limited',
  NO_PASSWORD: 'no password set',
}

const OUTCOME_TONE: Record<SignInOutcome, string> = {
  SUCCESS: 'text-[#3FB950]',
  BAD_PASSWORD: 'text-[#D29922]',
  UNKNOWN_EMAIL: 'text-[#8B949E]',
  RATE_LIMITED: 'text-[#F85149]',
  NO_PASSWORD: 'text-[#D29922]',
}

export function OutcomeBadge({ outcome }: { outcome: SignInOutcome }) {
  return (
    <span className={`rounded bg-[#21262D] px-1.5 py-0.5 font-mono text-[11px] font-semibold ${OUTCOME_TONE[outcome] ?? 'text-[#8B949E]'}`} data-testid="outcome" data-outcome={outcome}>
      {OUTCOME_LABEL[outcome] ?? outcome}
    </span>
  )
}
