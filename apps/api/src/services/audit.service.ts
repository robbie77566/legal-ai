import { withTenant } from '@hg/database'

export enum LogAction {
  AI_TOOL_CALL = 'AI_TOOL_CALL',
  DOCUMENT_UPLOAD = 'DOCUMENT_UPLOAD',
  CASE_ACCESS = 'CASE_ACCESS',
  WRIT_EXPORT = 'WRIT_EXPORT',
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
          action: params.action,
          userId: params.userId,
          details: params.details,
        },
      })
    )
  }
}
