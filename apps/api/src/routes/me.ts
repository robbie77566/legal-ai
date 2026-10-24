import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import prisma from '@hg/database';
import { generateToken, verifyToken } from '@hg/auth';
import { customerView, describeFacts, CaseFactsSchema, type CaseFacts, type CaseHold, type CaseStatus } from '@hg/case-lifecycle';
import { getStripe } from '../services/payments.service';
import { getObjectBytes, getObjectSize } from '../services/storage.service';
import { AuditService, LogAction } from '../services/audit.service';

/**
 * The family's account (your_account spec): one read model for everything a
 * family owns, and the four writes they may make — name, email (confirmed
 * from the new address), password, and a deletion *request* that an Admin
 * decides. Everything here is scoped to the signed-in user; the ledgers
 * have no FKs, so joins are the same two-step the ops routes use.
 */

const PasswordSchema = z
  .string()
  .min(12, 'Must be at least 12 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9!@#$%^&*()_+\-=\[\]{}|;':",.<>\/?]/, 'Must contain a number or symbol');

const origin = () => (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0];
// Backup email (your_account "Backup email (2026-10-24)"): the confirm link
// lives 24 hours, like the email-change link.
const BACKUP_WINDOW_MS = 24 * 3_600_000;
// Neutral on purpose: it must read the same whether the address is another
// account's sign-in email or simply refused, so nothing about other accounts leaks.
const BACKUP_REFUSED = "That address can't be used as a backup here";
/** The verified backup address, or null — the only backup a notice may go to. */
const verifiedBackup = (u: { backupEmail: string | null; backupEmailVerifiedAt: Date | null }) =>
  u.backupEmail && u.backupEmailVerifiedAt ? u.backupEmail : null;
const MID_PIPELINE: CaseStatus[] = ['DOCS_COMPLETE', 'DIGITIZING', 'ANALYZING', 'ADJUDICATING', 'QA_REVIEW', 'QA_REJECTED'];
const EXPORT_MAX_DOCS = 50;
// Review (2026-09-09): the bundle is built in memory — cap bytes, not just files.
const EXPORT_MAX_BYTES = 300 * 1024 * 1024;

export default async function meRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const { userId, tenantId } = request.auth;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, pendingEmail: true, passwordChangedAt: true, createdAt: true, deletedAt: true,
        backupEmail: true, backupEmailVerifiedAt: true, backupEmailExpires: true,
      },
    });
    if (!user || user.deletedAt) return reply.status(404).send({ error: 'Not found' });

    const access = await prisma.caseAccess.findMany({ where: { userId }, select: { caseId: true } });
    const caseIds = access.map((a) => a.caseId);
    const cases = caseIds.length
      ? await prisma.case.findMany({ where: { id: { in: caseIds }, status: { not: 'DELETED' } }, orderBy: { createdAt: 'desc' } })
      : [];
    const ids = cases.map((c) => c.id);

    const [docs, pages, reports, shareLinks, consents, payments, refunds, acks, deletionRequest] = await Promise.all([
      ids.length ? prisma.document.groupBy({ by: ['caseId'], where: { caseId: { in: ids }, quarantined: false }, _count: { _all: true } }) : [],
      ids.length ? prisma.documentPage.findMany({ where: { document: { caseId: { in: ids } }, billable: true }, select: { document: { select: { caseId: true } } } }) : [],
      ids.length ? prisma.report.findMany({ where: { caseId: { in: ids } }, orderBy: { versionNo: 'desc' }, select: { caseId: true, versionNo: true, renderedAt: true } }) : [],
      ids.length ? prisma.shareLink.findMany({ where: { caseId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : [],
      ids.length ? prisma.consentGrant.findMany({ where: { caseId: { in: ids }, revokedAt: null } }) : [],
      prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } }),
      ids.length ? prisma.refund.findMany({ where: { caseId: { in: ids } }, orderBy: { createdAt: 'desc' } }) : [],
      prisma.disclosureAck.findMany({ where: { userId }, orderBy: { ackAt: 'desc' }, select: { ackAt: true, disclosureSetVersion: true } }),
      prisma.staffRequest.findFirst({ where: { requestedBy: userId, type: 'ACCOUNT_DELETE', decision: null }, select: { createdAt: true } }),
    ]);

    const docCount = new Map(docs.map((d) => [d.caseId, d._count._all]));
    const pageCount = new Map<string, number>();
    for (const p of pages) pageCount.set(p.document.caseId, (pageCount.get(p.document.caseId) ?? 0) + 1);
    const titleOf = (c: (typeof cases)[number]) =>
      c.county && c.convictionYear ? `${c.county} County · ${c.convictionYear}` : `Review started ${c.createdAt.toISOString().slice(0, 10)}`;
    const caseTitle = new Map(cases.map((c) => [c.id, titleOf(c)]));

    // Receipt details: fetched from Stripe once, kept on the row (brand + last4 only).
    const stripe = getStripe();
    if (stripe) {
      for (const p of payments) {
        if (p.cardLast4 || !p.paymentIntentId) continue;
        try {
          const pi = await stripe.paymentIntents.retrieve(p.paymentIntentId, { expand: ['latest_charge'] });
          const charge = typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge : null;
          const card = charge?.payment_method_details?.card;
          const data = { cardBrand: card?.brand ?? null, cardLast4: card?.last4 ?? null, receiptUrl: charge?.receipt_url ?? null };
          await prisma.payment.update({ where: { id: p.id }, data });
          Object.assign(p, data);
        } catch (e) {
          request.log.warn({ err: e, paymentId: p.id }, 'receipt details unavailable');
        }
      }
    }

    return {
      user: {
        name: user.name,
        email: user.email,
        pendingEmail: user.pendingEmail,
        passwordChangedAt: user.passwordChangedAt,
        memberSince: user.createdAt,
        // Backup email (2026-10-24): the address and its state, never the token.
        // "Added" is derived from the token window while verification is pending.
        backupEmail: user.backupEmail,
        backupEmailVerified: !!user.backupEmail && !!user.backupEmailVerifiedAt,
        backupEmailVerifiedAt: user.backupEmail ? user.backupEmailVerifiedAt : null,
        backupEmailAddedAt: user.backupEmail && !user.backupEmailVerifiedAt && user.backupEmailExpires
          ? new Date(user.backupEmailExpires.getTime() - BACKUP_WINDOW_MS)
          : null,
      },
      reviews: cases.map((c) => {
        const holds: CaseHold[] = [];
        if (c.ocrHalt) holds.push('OCR_HALT');
        if (c.delayOurs) holds.push('DELAY_OURS');
        if (c.subsequentWrit) holds.push('SUBSEQUENT_WRIT_MODE');
        const parsed = CaseFactsSchema.safeParse(c.facts ?? {});
        const facts: CaseFacts = parsed.success ? parsed.data : {};
        const lines = describeFacts(facts, c);
        const factsLine = ['trialOrPlea', 'vehicle', 'appeal', 'priorWrit']
          .map((k) => lines.find((l) => l.key === k)?.value)
          .filter(Boolean)
          .join(' · ');
        const link = shareLinks.find((s) => s.caseId === c.id);
        const log = link && Array.isArray(link.accessLog) ? (link.accessLog as unknown[]) : [];
        return {
          id: c.id,
          title: caseTitle.get(c.id)!,
          status: c.status,
          stage: customerView(c.status as CaseStatus, holds),
          expectedReadyAt: c.expectedReadyAt,
          factsLine,
          documents: docCount.get(c.id) ?? 0,
          pages: pageCount.get(c.id) ?? 0,
          reportVersions: reports.filter((r) => r.caseId === c.id).map((r) => ({ versionNo: r.versionNo, renderedAt: r.renderedAt })),
          shareLink: link ? { createdAt: link.createdAt, expiresAt: link.expiresAt, revokedAt: link.revokedAt, opens: log.length } : null,
          clinicConsent: consents.some((g) => g.caseId === c.id && g.recipientClass === 'clinic'),
        };
      }),
      payments: payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        amountCents: p.amountCents,
        refundedCents: p.refundedCents,
        status: p.status,
        free: p.amountCents === 0 || p.stripeId.startsWith('promo_'),
        promoCode: p.promoCode,
        cardBrand: p.cardBrand,
        cardLast4: p.cardLast4,
        receiptUrl: p.receiptUrl,
        caseId: p.caseId,
        caseTitle: p.caseId ? caseTitle.get(p.caseId) ?? null : null,
        createdAt: p.createdAt,
      })),
      refunds: refunds.map((r) => {
        const p = payments.find((x) => x.id === r.paymentId);
        return {
          id: r.id,
          amountCents: r.amountCents,
          reason: r.reason,
          partial: p ? r.amountCents < p.amountCents : false,
          caseTitle: r.caseId ? caseTitle.get(r.caseId) ?? null : null,
          createdAt: r.createdAt,
        };
      }),
      acks: acks.map((a) => ({ ackAt: a.ackAt, version: a.disclosureSetVersion })),
      deletionRequest,
      tenantId,
    };
  });

  fastify.patch('/', async (request) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(100) }).parse(request.body);
    await prisma.user.update({ where: { id: request.auth.userId }, data: { name } });
    return { ok: true, name };
  });

  fastify.post('/password', async (request, reply) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: PasswordSchema })
      .parse(request.body);
    const user = await prisma.user.findUnique({
      where: { id: request.auth.userId },
      select: { email: true, passwordHash: true, backupEmail: true, backupEmailVerifiedAt: true },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return reply.status(400).send({ error: 'Current password is incorrect' });
    }
    await prisma.user.update({
      where: { id: request.auth.userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordChangedAt: new Date() },
    });
    // Security notice to the primary address and, once verified, the backup
    // (2026-10-24) — the backup exists so a lost primary still hears.
    const { sendPasswordChangedNotice } = await import('@hg/email');
    void sendPasswordChangedNotice(user.email);
    const backup = verifiedBackup(user);
    if (backup) void sendPasswordChangedNotice(backup);
    // The client refreshes its session (passwordChanged) so this device stays signed in; others are signed out.
    return { ok: true };
  });

  // Email change: held as pending until the new address confirms; the old
  // address is told. Sign-in keeps working with the old address meanwhile.
  fastify.post('/email', async (request, reply) => {
    const { newEmail, currentPassword } = z
      .object({ newEmail: z.string().email().max(254), currentPassword: z.string().min(1) })
      .parse(request.body);
    const email = newEmail.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { id: request.auth.userId } });
    if (!user?.passwordHash || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      return reply.status(400).send({ error: 'Current password is incorrect' });
    }
    if (email === user.email.toLowerCase()) return reply.status(400).send({ error: 'That is already your email address' });
    const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (taken) return reply.status(409).send({ error: 'That address is already in use' });

    const { raw, hash } = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { pendingEmail: email, emailChangeToken: hash, emailChangeExpires: new Date(Date.now() + 24 * 3_600_000) },
    });
    const { sendEmailChangeConfirm, sendEmailChangeNotice } = await import('@hg/email');
    void sendEmailChangeConfirm(email, { confirmUrl: `${origin()}/account/confirm-email?token=${raw}&id=${user.id}` });
    void sendEmailChangeNotice(user.email, { newEmail: email });
    // The verified backup hears too (2026-10-24) — unless it IS the new address.
    const backup = verifiedBackup(user);
    if (backup && backup.toLowerCase() !== email) void sendEmailChangeNotice(backup, { newEmail: email });
    return { ok: true, pendingEmail: email };
  });

  fastify.post('/email/confirm', { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const { userId, token } = z.object({ userId: z.string().max(64), token: z.string().max(128) }).parse(request.body);
    const fail = () => reply.status(400).send({ error: 'This link is invalid or has expired — start the change again from your account page.' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.pendingEmail || !user.emailChangeToken || !user.emailChangeExpires || user.emailChangeExpires < new Date()) return fail();
    if (!verifyToken(token, user.emailChangeToken)) return fail();
    const taken = await prisma.user.findFirst({ where: { email: { equals: user.pendingEmail, mode: 'insensitive' }, NOT: { id: user.id } } });
    if (taken) return reply.status(409).send({ error: 'That address is already in use' });
    // A backup that becomes the primary stops being a backup (2026-10-24):
    // the two addresses on an account are never the same one.
    const backupBecomesPrimary = !!user.backupEmail && user.backupEmail.toLowerCase() === user.pendingEmail.toLowerCase();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: user.pendingEmail, pendingEmail: null, emailChangeToken: null, emailChangeExpires: null,
        ...(backupBecomesPrimary ? { backupEmail: null, backupEmailVerifiedAt: null, backupEmailToken: null, backupEmailExpires: null } : {}),
      },
    });
    return { ok: true, email: user.pendingEmail };
  });

  fastify.delete('/email/pending', async (request) => {
    await prisma.user.update({ where: { id: request.auth.userId }, data: { pendingEmail: null, emailChangeToken: null, emailChangeExpires: null } });
    return { ok: true };
  });

  // ── Backup email (your_account "Backup email (2026-10-24)") ─────────────────
  // A second address, verified from a link sent to it, that password-reset
  // links may go to (auth-recovery.ts) and that hears every security notice.
  // The primary address is told about every step. Audit rows carry ids and
  // the op only — never an address.
  const backupLimit = { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } };
  const auditBackup = (tenantId: string, userId: string, op: 'backup_email_add' | 'backup_email_verify' | 'backup_email_remove') =>
    AuditService.log({ tenantId, caseId: `account:${userId}`, action: LogAction.ACCOUNT_SECURITY, userId, details: { op } });

  fastify.post('/backup-email', backupLimit, async (request, reply) => {
    const { email: raw } = z.object({ email: z.string().trim().email().max(254) }).parse(request.body);
    const email = raw.trim().toLowerCase();
    const { userId, tenantId } = request.auth;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, deletedAt: true } });
    if (!user || user.deletedAt) return reply.status(404).send({ error: 'Not found' });
    if (email === user.email.toLowerCase()) {
      return reply.status(400).send({ error: 'That is your sign-in address — a backup has to be a different one' });
    }
    // Another account's sign-in address is refused with the neutral message.
    const taken = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, NOT: { id: user.id } }, select: { id: true } });
    if (taken) return reply.status(400).send({ error: BACKUP_REFUSED });

    // Re-posting replaces whatever was there (pending or verified) and re-issues the link.
    const { raw: token, hash } = generateToken();
    await prisma.user.update({
      where: { id: user.id },
      data: { backupEmail: email, backupEmailVerifiedAt: null, backupEmailToken: hash, backupEmailExpires: new Date(Date.now() + BACKUP_WINDOW_MS) },
    });
    await auditBackup(tenantId, userId, 'backup_email_add');
    const { sendBackupEmailConfirm, sendBackupEmailNotice, maskEmail } = await import('@hg/email');
    void sendBackupEmailConfirm(email, { confirmUrl: `${origin()}/auth/backup-email/confirm?token=${token}`, primaryMasked: maskEmail(user.email) });
    void sendBackupEmailNotice(user.email, { event: 'added', backupMasked: maskEmail(email) });
    return { ok: true, backupEmail: email, backupEmailVerified: false };
  });

  // Public (plugins/auth.ts PUBLIC_PREFIXES): the link alone proves the
  // address; the token is looked up by its hash and checked timing-safely.
  fastify.post('/backup-email/confirm', backupLimit, async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(128) }).parse(request.body);
    const fail = () => reply.status(400).send({ error: 'This link is invalid or has expired — add the backup email again from your account page to get a new one.' });
    const hash = createHash('sha256').update(token).digest('hex');
    const user = await prisma.user.findFirst({
      where: { backupEmailToken: hash, deletedAt: null },
      select: { id: true, tenantId: true, email: true, backupEmail: true, backupEmailToken: true, backupEmailExpires: true },
    });
    if (!user?.backupEmail || !user.backupEmailToken || !user.backupEmailExpires || user.backupEmailExpires < new Date()) return fail();
    if (!verifyToken(token, user.backupEmailToken)) return fail();
    // Someone may have taken the address as a sign-in email meanwhile.
    const taken = await prisma.user.findFirst({ where: { email: { equals: user.backupEmail, mode: 'insensitive' }, NOT: { id: user.id } }, select: { id: true } });
    if (taken) return reply.status(400).send({ error: BACKUP_REFUSED });
    await prisma.user.update({
      where: { id: user.id },
      data: { backupEmailVerifiedAt: new Date(), backupEmailToken: null, backupEmailExpires: null },
    });
    await auditBackup(user.tenantId, user.id, 'backup_email_verify');
    const { sendBackupEmailNotice, maskEmail } = await import('@hg/email');
    const backupMasked = maskEmail(user.backupEmail);
    void sendBackupEmailNotice(user.email, { event: 'verified', backupMasked });
    void sendBackupEmailNotice(user.backupEmail, { event: 'verified', backupMasked });
    return { ok: true, backupEmail: user.backupEmail };
  });

  fastify.delete('/backup-email', async (request) => {
    const { userId, tenantId } = request.auth;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, backupEmail: true } });
    await prisma.user.update({
      where: { id: userId },
      data: { backupEmail: null, backupEmailVerifiedAt: null, backupEmailToken: null, backupEmailExpires: null },
    });
    if (user?.backupEmail) {
      await auditBackup(tenantId, userId, 'backup_email_remove');
      const { sendBackupEmailNotice, maskEmail } = await import('@hg/email');
      const backupMasked = maskEmail(user.backupEmail);
      void sendBackupEmailNotice(user.email, { event: 'removed', backupMasked });
      void sendBackupEmailNotice(user.backupEmail, { event: 'removed', backupMasked });
    }
    return { ok: true };
  });

  // Deletion is a request (your_account §8): an Admin runs the scoped
  // deletion; a review mid-pipeline is finished or refunded first.
  // Visit heartbeat for the admin's Accounts page. The web app posts on
  // every page (pageview) and every minute the tab is visible; the service
  // folds beats within 30 minutes into one visit. Any signed-in role.
  fastify.post('/visit', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request) => {
    const { userId, tenantId } = request.auth;
    const { pageview } = z.object({ pageview: z.boolean().optional() }).parse(request.body ?? {});
    const { touchVisit } = await import('../services/visits.service');
    return touchVisit(userId, tenantId, { pageview: pageview ?? false });
  });

  fastify.post('/delete-request', async (request, reply) => {
    const { userId } = request.auth;
    const access = await prisma.caseAccess.findMany({ where: { userId }, select: { caseId: true } });
    const cases = await prisma.case.findMany({
      where: { id: { in: access.map((a) => a.caseId) }, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true },
    });
    if (cases.length === 0) {
      // A request needs a case to hang off (staff_requests.service); with none,
      // a person removes the account by hand.
      return reply.status(409).send({ error: 'You have no reviews on this account yet — reply to any of our emails or use Contact and a person will remove the account for you.' });
    }
    if (cases.some((c) => MID_PIPELINE.includes(c.status as CaseStatus))) {
      return reply.status(409).send({ error: 'A review is still running. Once it finishes (or if you ask us for a refund instead), you can request deletion here.' });
    }
    const open = await prisma.staffRequest.findFirst({ where: { requestedBy: userId, type: 'ACCOUNT_DELETE', decision: null } });
    if (open) return { ok: true, requestedAt: open.createdAt, already: true };
    const { openRequest } = await import('../services/staff-requests.service');
    const out = await openRequest({
      caseId: cases[0]?.id ?? `account:${userId}`,
      type: 'ACCOUNT_DELETE',
      reason: 'customer_request',
      note: 'Requested by the family from their account page.',
      requestedBy: userId,
    });
    if (!out.ok) return reply.status(409).send({ error: 'Could not record the request — please contact us.' });
    return { ok: true, requestedAt: out.request.createdAt };
  });

  // Everything they uploaded, as they sent it — one zip, audited.
  fastify.get('/export', async (request, reply) => {
    const { userId, tenantId } = request.auth;
    const access = await prisma.caseAccess.findMany({ where: { userId }, select: { caseId: true } });
    const docs = await prisma.document.findMany({
      where: { caseId: { in: access.map((a) => a.caseId) }, quarantined: false, s3Key: { not: null } },
      select: { id: true, filename: true, s3Key: true, caseId: true, case: { select: { county: true, convictionYear: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (docs.length === 0) return reply.status(404).send({ error: 'Nothing to download yet' });
    if (docs.length > EXPORT_MAX_DOCS) {
      return reply.status(413).send({ error: `Too many files to bundle at once (${docs.length}). Download them from each review's documents page.` });
    }
    const sizes = await Promise.all(docs.map((d) => getObjectSize(d.s3Key!).catch(() => 0)));
    const totalBytes = sizes.reduce((a, b) => a + b, 0);
    if (totalBytes > EXPORT_MAX_BYTES) {
      return reply.status(413).send({
        error: `Your documents are too large to bundle at once (${Math.round(totalBytes / 1048576)} MB). Download them from each review's documents page.`,
      });
    }
    const zip = new AdmZip();
    for (const d of docs) {
      const folder = d.case.county && d.case.convictionYear ? `${d.case.county} County ${d.case.convictionYear}` : `Review ${d.case.createdAt.toISOString().slice(0, 10)}`;
      zip.addFile(`${folder.replace(/[^\w .-]/g, '_')}/${d.filename.replace(/[^\w .-]/g, '_')}`, await getObjectBytes(d.s3Key!));
    }
    await AuditService.log({
      tenantId, caseId: `account:${userId}`, action: LogAction.CASE_ACCESS, userId,
      details: { op: 'account_export', documents: docs.length },
    });
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', 'attachment; filename="my-court-documents.zip"')
      .send(zip.toBuffer());
  });
}
