/**
 * Shapes the staff console reads for organisations (staff_console.md §11–§12):
 * GET /ops/organisations rows and GET /ops/organisations/:id/metrics.
 */
import type { OrganisationKind } from '@/lib/api'

export interface OrganisationRow {
  id: string
  kind: OrganisationKind | 'FAMILY'
  name: string
  legalName: string | null
  billingEmail: string | null
  securityContact: string | null
  pilot: boolean
  pilotEndsAt: string | null
  allowanceRecords: number
  allowanceResetsAt: string | null
  publicInterest: boolean
  isTest: boolean
  tenantId: string
  memberCount: number
  createdAt: string
}
export interface OrganisationMetrics {
  organisationId: string
  recordsOpened: number
  analysesRun: number
  allowance: { granted: number; used: number; remaining: number; resetsAt: string | null; pilot: boolean; pilotEndsAt: string | null; publicInterest: boolean }
  members: number
  lastActivity: string | null
}

export const KIND_LABEL: Record<string, string> = { FIRM: 'Firm', PD_OFFICE: 'PD office', CLINIC: 'Clinic', FAMILY: 'Family' }
export const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')

