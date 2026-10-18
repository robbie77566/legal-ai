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

/** SSE stream against the API with the session cookie attached. */
export function apiEventSource(path: string): EventSource {
  return new EventSource(`${API_URL}${path}`, { withCredentials: true })
}
