import prisma, { withTenant, appendCaseEvent } from '@hg/database';
import { AuditService, LogAction } from './audit.service';

/**
 * A family removes one or more of their uploaded files (2026-09-27).
 *
 * Allowed only while the case is still collecting documents
 * (AWAITING_DOCS): once the review has run, every citation points at a
 * chunk of a document, and a report is re-verified against those chunks
 * at every render (FR-7) — pulling a document out from under a delivered
 * report would silently drop its findings. A document any finding cites
 * is refused for the same reason even during a re-run's collection phase.
 *
 * Removal undoes what the upload did: the pages and chunks go, the
 * checklist item the file satisfied returns to NEEDED unless another file
 * covers it, the bytes leave storage (every version), and a duplicate
 * page in another file that had deferred to this one is re-read so the
 * record keeps that text. Events and the audit log record the act.
 */

export type RemovalRefusal = 'review_started' | 'not_found' | 'in_report';

export interface RemovalResult {
  removed: { id: string; filename: string; pages: number }[];
  refused: { id: string; reason: RemovalRefusal }[];
}

export async function removeDocuments(
  caseId: string,
  tenantId: string,
  userId: string,
  documentIds: string[]
): Promise<RemovalResult> {
  const result: RemovalResult = { removed: [], refused: [] };
  const ids = [...new Set(documentIds)];
  if (ids.length === 0) return result;

  const kase = await prisma.case.findUnique({ where: { id: caseId }, select: { status: true } });
  if (!kase || kase.status !== 'AWAITING_DOCS') {
    result.refused = ids.map((id) => ({ id, reason: 'review_started' as const }));
    return result;
  }

  const hashesGone = new Set<string>();
  const keysToDelete: string[] = [];

  type Outcome =
    | { refused: RemovalRefusal }
    | { removed: { id: string; filename: string; pages: number; s3Key: string | null; hashes: string[] } };
  for (const id of ids) {
    const outcome: Outcome = await withTenant(tenantId, async (tx): Promise<Outcome> => {
      const doc = await tx.document.findFirst({ where: { id, caseId }, include: { pages: { select: { contentHash: true } } } });
      if (!doc) return { refused: 'not_found' };
      const cited = await tx.findingCitation.count({ where: { documentId: id } });
      if (cited > 0) return { refused: 'in_report' };

      await tx.documentChunk.deleteMany({ where: { documentId: id } });
      await tx.documentPage.deleteMany({ where: { documentId: id } });
      await tx.document.delete({ where: { id } });

      // The checklist item this file satisfied: back to NEEDED unless
      // another file still covers it.
      if (doc.suggestedChecklistItemId) {
        const others = await tx.document.count({ where: { caseId, suggestedChecklistItemId: doc.suggestedChecklistItemId } });
        if (others === 0) {
          await tx.checklistItem.update({ where: { id: doc.suggestedChecklistItemId }, data: { state: 'NEEDED' } }).catch(() => {});
        }
      }
      await appendCaseEvent(tx, {
        caseId, tenantId, type: 'doc.removed',
        payload: { documentId: id, pages: doc.pages.length }, actor: userId,
      });
      return { removed: { id, filename: doc.filename, pages: doc.pages.length, s3Key: doc.s3Key, hashes: doc.pages.map((p) => p.contentHash) } };
    });

    if ('refused' in outcome) {
      result.refused.push({ id, reason: outcome.refused });
      continue;
    }
    result.removed.push({ id, filename: outcome.removed.filename, pages: outcome.removed.pages });
    for (const h of outcome.removed.hashes) hashesGone.add(h);
    if (outcome.removed.s3Key) keysToDelete.push(outcome.removed.s3Key);
    await AuditService.log({
      tenantId, caseId, action: LogAction.DOCUMENT_REMOVE, userId,
      details: { documentId: id, pages: outcome.removed.pages },
    });
  }

  // Storage: every version of each removed object, best-effort — the
  // record is already consistent; a storage hiccup is logged, never shown
  // as a failed removal.
  if (keysToDelete.length > 0) {
    try {
      const { deleteObjectVersions } = await import('./storage.service');
      for (const key of keysToDelete) await deleteObjectVersions(key);
    } catch (e) {
      console.warn(`[documents] storage delete after removal failed (case ${caseId}): ${(e as Error).message.slice(0, 200)}`);
    }
  }

  // A page in another file that was marked a duplicate of a removed page
  // holds no chunk of its own — re-read that file so the text stays in
  // the record.
  if (hashesGone.size > 0) {
    const deferred = await prisma.documentPage.findMany({
      where: { document: { caseId, quarantined: false }, dedupKind: { not: null }, contentHash: { in: [...hashesGone] } },
      select: { document: { select: { id: true, s3Key: true } } },
    });
    const reread = new Map(deferred.map((p) => [p.document.id, p.document.s3Key]));
    if (reread.size > 0) {
      try {
        const { enqueueDocument } = await import('./queue');
        for (const [docId, s3Key] of reread) if (s3Key) await enqueueDocument(docId, s3Key, caseId);
      } catch (e) {
        console.warn(`[documents] re-read after removal could not be queued (case ${caseId}): ${(e as Error).message.slice(0, 200)}`);
      }
    }
  }

  return result;
}
