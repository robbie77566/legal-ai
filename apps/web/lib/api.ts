/**
 * The single API client for the Fastify backend.
 *
 * Authentication rides on the NextAuth session cookie (`credentials:
 * "include"`); the API verifies the token and derives userId/tenantId/role
 * from it (system design §10.1). Never send x-tenant-id / x-user-id headers —
 * the API ignores them.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, { credentials: 'include', ...init })
}

/** Body of POST /counsel/signup (apps/api/src/routes/counsel.ts). */
export interface CounselSignupBody {
  email: string
  password: string
  name: string
  barNumber: string
  barState?: string // defaults to 'TX'
  practiceType: 'writ' | 'appellate' | 'trial' | 'pd' | 'clinic' | 'investigator' | 'other'
  organisationName?: string
  organisationKind?: 'FIRM' | 'PD_OFFICE' | 'CLINIC'
}

/** Professional self-registration (persona plan A). The /for-counsel/signup page (workstream F) posts through here. */
export function counselSignup(body: CounselSignupBody): Promise<Response> {
  return apiFetch('/counsel/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── Matters (persona plan C; apps/api/src/routes/matters.ts) ─────────────────
// The input types come from the zod schemas the api validates with, so the
// form (workstream F) and the route can never disagree. Initials only, never
// a client name.
import type { MatterCreateInput, MatterPatchInput } from '@hg/case-lifecycle'
export type { MatterCreateInput, MatterPatchInput, MatterSummary, MatterView } from '@hg/case-lifecycle'

const json = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** POST /counsel/matters → 201 { caseId, matterId }; 422 { reason: 'CAPITAL_REFUSED' }; 404 while the surface is dark. */
export function createMatter(body: MatterCreateInput): Promise<Response> {
  return apiFetch('/counsel/matters', { method: 'POST', ...json(body) })
}

/** GET /counsel/matters → { matters: MatterSummary[] } for the caller's organisation. */
export function listMatters(): Promise<Response> {
  return apiFetch('/counsel/matters')
}

/** GET /counsel/matters/:caseId → { matter, case, trapClock, checklist, locked }; `asOf` replays the clock. */
export function getMatter(caseId: string, opts: { asOf?: string } = {}): Promise<Response> {
  const q = opts.asOf ? `?asOf=${encodeURIComponent(opts.asOf)}` : ''
  return apiFetch(`/counsel/matters/${encodeURIComponent(caseId)}${q}`)
}

/** PATCH /counsel/matters/:caseId → { matter }; 409 { reason: 'LOCKED', locked } once the engine has read a date. */
export function updateMatter(caseId: string, body: MatterPatchInput): Promise<Response> {
  return apiFetch(`/counsel/matters/${encodeURIComponent(caseId)}`, { method: 'PATCH', ...json(body) })
}

/** SSE stream against the API with the session cookie attached. */
export function apiEventSource(path: string): EventSource {
  return new EventSource(`${API_URL}${path}`, { withCredentials: true })
}
