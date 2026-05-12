import { getTenantPrisma } from '@legal-ai/database'

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
    const tenantPrisma = getTenantPrisma(params.tenantId)
    
    return await tenantPrisma.auditLog.create({
      data: {
        caseId: params.caseId,
        action: params.action,
        userId: params.userId,
        details: params.details,
      },
    })
  }
}
