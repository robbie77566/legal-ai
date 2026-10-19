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

const jsonBody = (body: unknown): RequestInit => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** POST /counsel/matters → 201 { caseId, matterId }; 422 { reason: 'CAPITAL_REFUSED' }; 404 while the surface is dark. */
export function createMatter(body: MatterCreateInput): Promise<Response> {
  return apiFetch('/counsel/matters', { method: 'POST', ...jsonBody(body) })
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
  return apiFetch(`/counsel/matters/${encodeURIComponent(caseId)}`, { method: 'PATCH', ...jsonBody(body) })
}

/** SSE stream against the API with the session cookie attached. */
export function apiEventSource(path: string): EventSource {
  return new EventSource(`${API_URL}${path}`, { withCredentials: true })
}

// ── Workstream I: organisations, seats, the clinic inbox, Record Desk requests ──
// Thin typed helpers over the api routes in apps/api/src/routes/counsel-org.ts,
// packets.ts, investigations.ts and ops-organisations.ts. The pages that use
// them are workstreams F (counsel) and G (staff console).

export type MembershipRole = 'OWNER' | 'ATTORNEY' | 'INVESTIGATOR' | 'VIEWER'
export type OrganisationKind = 'FIRM' | 'PD_OFFICE' | 'CLINIC'

const json = (method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

/** GET /counsel/org — the organisation, its members, pending invitations and the allowance as staff granted it. */
export const getCounselOrganisation = () => apiFetch('/counsel/org')
/** POST /counsel/org/invitations — OWNER offers a seat; investigator and viewer seats are free. */
export const inviteColleague = (body: { email: string; role: MembershipRole }) => apiFetch('/counsel/org/invitations', json('POST', body))
/** POST /counsel/org/invitations/:token/accept — public; the /counsel/join page posts the token from the email. */
export const acceptInvitation = (token: string, body: { name?: string; password?: string }) =>
  apiFetch(`/counsel/org/invitations/${encodeURIComponent(token)}/accept`, json('POST', body))
/** DELETE /counsel/org/members/:userId — OWNER removes a seat (never the last owner). */
export const removeMember = (userId: string) => apiFetch(`/counsel/org/members/${encodeURIComponent(userId)}`, json('DELETE'))

/** GET /cases/:id/packets/clinics — the clinics a family may deliver to (empty while none has a live inbox). */
export const listClinics = (caseId: string) => apiFetch(`/cases/${caseId}/packets/clinics`)
/** POST /cases/:id/packets/deliver — the family delivers the released packet to a clinic it consented to. */
export const deliverPacket = (caseId: string, clinicOrganisationId: string) =>
  apiFetch(`/cases/${caseId}/packets/deliver`, json('POST', { clinicOrganisationId }))
/** GET /counsel/inbox — a CLINIC organisation's deliveries, newest first. */
export const getClinicInbox = () => apiFetch('/counsel/inbox')
/** The PDF of one delivery (streamed; open in a new tab or fetch as a blob). */
export const clinicInboxPdfUrl = (deliveryId: string) => `${API_URL}/counsel/inbox/${encodeURIComponent(deliveryId)}/report.pdf`

export interface InvestigationRequestBody {
  kind: 'CHRONOLOGY' | 'RECORDS_TRACKER' | 'OTHER'
  caseId?: string
  pages?: number
  dueBy?: string // YYYY-MM-DD
  note: string
}
/** POST /counsel/investigations — an investigator, attorney or owner files a Record Desk request. */
export const fileInvestigationRequest = (body: InvestigationRequestBody) => apiFetch('/counsel/investigations', json('POST', body))
/** GET /counsel/investigations — the organisation's requests with their status and the staff note. */
export const listInvestigationRequests = () => apiFetch('/counsel/investigations')

// Staff console (Admin writes, Support reads; investigation PATCH is open to Support for IN_PROGRESS / DELIVERED).
export const opsListOrganisations = (params?: { kind?: OrganisationKind; q?: string }) => {
  const qs = new URLSearchParams()
  if (params?.kind) qs.set('kind', params.kind)
  if (params?.q) qs.set('q', params.q)
  const tail = qs.toString()
  return apiFetch(`/ops/organisations${tail ? `?${tail}` : ''}`)
}
export const opsGetOrganisation = (id: string) => apiFetch(`/ops/organisations/${encodeURIComponent(id)}`)
export interface OrganisationPatch {
  kind?: OrganisationKind
  name?: string
  legalName?: string | null
  billingEmail?: string | null
  securityContact?: string | null
  pilot?: boolean
  pilotEndsAt?: string | null
  allowanceRecords?: number
  allowanceResetsAt?: string | null
  publicInterest?: boolean
  isTest?: boolean
}
export const opsPatchOrganisation = (id: string, body: OrganisationPatch) => apiFetch(`/ops/organisations/${encodeURIComponent(id)}`, json('PATCH', body))
/** Starts the PD pilot: 15 records, 90 days from now. */
export const opsStartPilot = (id: string) => apiFetch(`/ops/organisations/${encodeURIComponent(id)}/pilot`, json('POST'))
/** Grants the public-interest allowance: 25 records a year at $0. */
export const opsGrantPublicInterest = (id: string) => apiFetch(`/ops/organisations/${encodeURIComponent(id)}/public-interest`, json('POST'))
export const opsOrganisationMetrics = (id: string) => apiFetch(`/ops/organisations/${encodeURIComponent(id)}/metrics`)
export const opsListInvestigations = (status?: 'OPEN' | 'IN_PROGRESS' | 'DELIVERED' | 'DECLINED') =>
  apiFetch(`/ops/investigations${status ? `?status=${status}` : ''}`)
export const opsUpdateInvestigation = (id: string, body: { status?: 'OPEN' | 'IN_PROGRESS' | 'DELIVERED' | 'DECLINED'; assignedTo?: string | null; note?: string | null }) =>
  apiFetch(`/ops/investigations/${encodeURIComponent(id)}`, json('PATCH', body))
