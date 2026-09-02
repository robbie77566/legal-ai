import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import crypto from 'crypto';

/**
 * OPS-4 scoped deletion (§11a.2), extracted so both the per-case route and
 * account deletion share ONE implementation. Hard-deletes case content and
 * leaves exactly what the retention matrix keeps: the payment ledger (7y),
 * the disclosure-ack archive (24mo), and the PII-minimal event/audit
 * skeleton — with the deletion certificate written into that stream.
 */
export interface ScopedDeletionCounts {
  citations: number;
  findings: number;
  reports: number;
  runs: number;
  chunks: number;
  pages: number;
  documents: number;
  checklist: number;
  uploadSessions: number;
  access: number;
  feedback: number;
  s3ObjectsRemoved: number;
}

export async function deleteCaseScoped(caseId: string, actor: string): Promise<ScopedDeletionCounts | null> {
  const kase = await prisma.case.findUnique({ where: { id: caseId } });
  if (!kase) return null;
  const tenantId = kase.tenantId;

  // Deletion request + terminal transition land in the surviving stream
  // BEFORE content removal (the certificate trail).
  await withTenant(tenantId, async (tx) => {
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'deletion.requested', payload: {}, actor,
    });
    await appendCaseEvent(tx, {
      caseId, tenantId, type: 'stage.entered', payload: { status: 'DELETED' },
      actor, transition: 'DELETED',
    });
  });

  const deleted = await prisma.$transaction(async (tx) => {
    const docs = await tx.document.findMany({ where: { caseId }, select: { id: true } });
    const docIds = docs.map((d) => d.id);
    const findings = await tx.finding.findMany({ where: { caseId }, select: { id: true } });
    const findingIds = findings.map((f) => f.id);

    const counts = {
      citations: (await tx.findingCitation.deleteMany({ where: { findingId: { in: findingIds } } })).count,
      findings: (await tx.finding.deleteMany({ where: { caseId } })).count,
      reports: (await tx.report.deleteMany({ where: { caseId } })).count,
      runs: (await tx.analysisRun.deleteMany({ where: { caseId } })).count,
      chunks: (await tx.documentChunk.deleteMany({ where: { documentId: { in: docIds } } })).count,
      pages: (await tx.documentPage.deleteMany({ where: { documentId: { in: docIds } } })).count,
      documents: (await tx.document.deleteMany({ where: { caseId } })).count,
      checklist: (await tx.checklistItem.deleteMany({ where: { caseId } })).count,
      uploadSessions: (await tx.uploadSession.deleteMany({ where: { caseId } })).count,
      access: (await tx.caseAccess.deleteMany({ where: { caseId } })).count,
      // Open feedback text is PII-adjacent — it dies with the case (gap fixed
      // 2026-09-02; the original inline route missed it).
      feedback: (await tx.caseFeedback.deleteMany({ where: { caseId } })).count,
    };
    await tx.case.delete({ where: { id: caseId } });
    return counts;
  });

  // S3: every object AND version under cases/{id}/ (bucket is versioned);
  // failure is loud — a missed S3 pass is an Ops follow-up, and the ≤35-day
  // version expiry bounds full propagation either way (§11a.2).
  let s3ObjectsRemoved = 0;
  try {
    const { deleteCasePrefix } = await import('./storage.service');
    s3ObjectsRemoved = await deleteCasePrefix(caseId);
  } catch (e) {
    console.error(`OPS-4: S3 deletion failed for ${caseId} — follow up required:`, (e as Error).message);
  }

  // The completion certificate — written AFTER the Case row is gone, into
  // the surviving stream (CaseEvent has no FK by design).
  await prisma.caseEvent.create({
    data: { caseId, tenantId, type: 'deletion.completed', version: 1, payload: {}, actor },
  });

  return { ...deleted, s3ObjectsRemoved };
}

/**
 * Account deletion (admin capability, 2026-09-02): consumer accounts only.
 * Every case in the user's OWN tenant goes through the scoped deletion;
 * cross-tenant shares lose only the access rows. The user row is then
 * ANONYMIZED, not dropped — the retained payment ledger references it — and
 * the email is freed for reuse. passwordChangedAt kills any live session.
 */
export async function deleteAccount(userId: string, actor: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: 'not_found' as const };
  if (user.role !== 'CLIENT') return { error: 'staff_account' as const };
  if (user.deletedAt) return { error: 'already_deleted' as const };

  const ownCases = await prisma.case.findMany({
    where: { tenantId: user.tenantId, accessList: { some: { userId } } },
    select: { id: true },
  });
  const casesDeleted: string[] = [];
  for (const c of ownCases) {
    if (await deleteCaseScoped(c.id, actor)) casesDeleted.push(c.id);
  }
  const sharesRemoved = (await prisma.caseAccess.deleteMany({ where: { userId } })).count;

  const originalEmail = user.email;
  await prisma.user.update({
    where: { id: userId },
    data: {
      email: `deleted.${userId}@invalid.snotnoselegal.com`,
      name: null,
      passwordHash: crypto.randomBytes(32).toString('hex'), // never matches any password
      passwordChangedAt: new Date(), // session-invalidation guard kills live sessions
      resetToken: null,
      resetExpires: null,
      inviteToken: null,
      inviteExpires: null,
      deletedAt: new Date(),
    },
  });

  return { originalEmail, casesDeleted, sharesRemoved };
}
