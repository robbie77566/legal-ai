import { BRAND } from '@hg/case-lifecycle';
import type { NewAccountKind } from '@hg/email';

/**
 * Admin notice on every self-service account creation (2026-11-17): the
 * family buy page, the counsel signup and an accepted seat invitation each
 * call this once the row exists. Fire-and-forget (ENG-9): a failed or
 * dropped email never fails the signup. The recipient is the operator
 * address in brand.ts; on staging EMAIL_ALLOWLIST decides whether it leaves.
 */
export const ADMIN_NOTICE_TO = BRAND.email;

export function notifyAdminNewAccount(opts: {
  userId: string;
  kind: NewAccountKind;
  name?: string | null;
  email: string;
  organisationName?: string | null;
  organisationKind?: string | null;
  role?: string | null;
  createdAt?: Date;
}): void {
  void (async () => {
    const origin = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0].replace(/\/+$/, '');
    const { sendNewAccountNotice } = await import('@hg/email');
    await sendNewAccountNotice(ADMIN_NOTICE_TO, {
      kind: opts.kind,
      name: opts.name,
      email: opts.email,
      organisationName: opts.organisationName,
      organisationKind: opts.organisationKind,
      role: opts.role,
      createdAt: opts.createdAt ?? new Date(),
      accountUrl: `${origin}/ops/accounts/${opts.userId}`,
    });
  })().catch((e) => console.warn('[accounts] admin new-account notice failed:', (e as Error).message));
}
