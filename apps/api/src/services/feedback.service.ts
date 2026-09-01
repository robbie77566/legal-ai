import prisma from '@hg/database';

/**
 * Touch 2 (+7 days) of the feedback program: one email per case, stamped
 * idempotently, only for cases whose report has been ready ≥7 days.
 * Never sent to refunded/deleted cases (anti-recommendation §2.3).
 */
export async function sendFeedbackFollowups(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 3600_000);
  const reports = await prisma.report.findMany({
    where: { renderedAt: { lt: cutoff } },
    select: { caseId: true, tenantId: true },
    distinct: ['caseId'],
    take: 200,
  });
  let sent = 0;
  for (const r of reports) {
    const kase = await prisma.case.findUnique({ where: { id: r.caseId } });
    if (!kase || !['READY', 'DELIVERED'].includes(kase.status)) continue;
    const existing = await prisma.caseFeedback.findUnique({ where: { caseId: r.caseId } });
    if (existing?.followupSentAt) continue;

    const ownerAccess = await prisma.caseAccess.findFirst({ where: { caseId: r.caseId, role: 'ADMIN' } });
    const owner = ownerAccess ? await prisma.user.findUnique({ where: { id: ownerAccess.userId } }) : null;
    if (owner?.email) {
      const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
      const { sendFeedbackFollowup } = await import('@hg/email');
      await sendFeedbackFollowup(owner.email, { surveyUrl: `${origin}/case/${r.caseId}/report?survey=share` });
    }
    await prisma.caseFeedback.upsert({
      where: { caseId: r.caseId },
      create: { caseId: r.caseId, tenantId: r.tenantId, followupSentAt: now },
      update: { followupSentAt: now },
    });
    sent++;
  }
  if (sent > 0) console.log(`[feedback] +7d follow-ups sent: ${sent}`);
  return sent;
}
