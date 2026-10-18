/**
 * Where a sign-in lands (US-11, persona_rollout_plan.md §3 "audiences never
 * see each other's copy"). Pure so /go's decision is unit-tested:
 * PROFESSIONAL → /counsel; staff ATTORNEY → /qa; ADMIN | SUPPORT → /ops;
 * everyone else (the family) → /account. accountKind is checked first so an
 * attorney customer never lands on the QA console.
 */
export function landingFor({ role, accountKind }: { role?: string | null; accountKind?: string | null }): string {
  if (accountKind === 'PROFESSIONAL') return '/counsel'
  if (role === 'ATTORNEY') return '/qa'
  if (role === 'ADMIN' || role === 'SUPPORT') return '/ops'
  return '/account'
}
