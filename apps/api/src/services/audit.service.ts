import { withTenant } from '@hg/database'

export enum LogAction {
  AI_TOOL_CALL = 'AI_TOOL_CALL',
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  DOCUMENT_REMOVE = 'DOCUMENT_REMOVE',
  CASE_ACCESS = 'CASE_ACCESS',
  WRIT_EXPORT = 'WRIT_EXPORT',
  QA_EDIT = 'QA_EDIT',
  QA_DECISION = 'QA_DECISION',
  REFUND = 'REFUND',
  FLAG_CHANGE = 'FLAG_CHANGE', // feature flag flips and tenant overrides (staff_console.md §10)
  ACCOUNT_SIGNUP = 'ACCOUNT_SIGNUP', // self-registration (counsel sign-up); never carries the bar number
  QUOTE_DECISION = 'QUOTE_DECISION', // an admin answered a Long-record quote request (workstream B)
  INVOICE = 'INVOICE', // an admin created or marked paid an ACH invoice (workstream B)
  MATTER_OPENED = 'MATTER_OPENED', // counsel opened a matter (workstream C); ids and vehicle only, never initials or dates
  MATTER_UPDATED = 'MATTER_UPDATED', // counsel edited a matter; the changed KEYS only
  // Workstream I (persona_rollout_plan.md §5 I): organisations, seats, the clinic inbox, the Record Desk.
  ORGANISATION_CHANGE = 'ORGANISATION_CHANGE', // staff edits an organisation: kind, pilot, allowance, public-interest, isTest
  SEAT_CHANGE = 'SEAT_CHANGE', // an owner invites or removes a colleague
  PACKET_DELIVERY = 'PACKET_DELIVERY', // a family delivers a consented packet; a clinic opens it
  INVESTIGATION_REQUEST = 'INVESTIGATION_REQUEST', // a Record Desk request filed or moved by staff
}

export class AuditService {
  static async log(params: {
    tenantId: string
    caseId: string
    action: LogAction
    userId: string
    details: any
  }) {
    // RLS-scoped write: withTenant sets app.current_tenant_id for the transaction,
    // so the AuditLog insert passes the tenant policy. Wiring this service into the
    // permission/case mutation paths is an M0 task (implementation plan §3).
    return withTenant(params.tenantId, (tx) =>
      tx.auditLog.create({
        data: {
          caseId: params.caseId,
          tenantId: params.tenantId,
          action: params.action,
          userId: params.userId,
          details: params.details,
        },
      })
    )
  }
}
