/**
 * Transactional email (M2, ENG-9, auth design Phase 2).
 *
 * Provider seam: Resend when RESEND_API_KEY is set, an honest console
 * transport otherwise (dev logs the send loudly — mail is never silently
 * "sent"). Copy follows the Daybreak voice: plain words, no urgency theater,
 * every message says what happens next. All strings live here — the copy
 * canon's email section (UXG-2).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(msg: EmailMessage): Promise<{ delivered: boolean; id?: string; error?: string }>;
}

const FROM = () => process.env.EMAIL_FROM ?? 'Family Case Review <noreply@snotnoselegal.com>';

function buildProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      async send(msg) {
        // Honest console transport: print the BODY too — a reset link that
        // exists only inside an unsent email is useless to the operator
        // reading the log (bit us 2026-09-02).
        console.warn(`[email] RESEND_API_KEY not set — NOT delivered: "${msg.subject}" → ${msg.to}\n${msg.text}`);
        return { delivered: false, error: 'RESEND_API_KEY is not set on this service — logging only' };
      },
    };
  }
  return {
    async send(msg) {
      const { Resend } = await import('resend');
      const resend = new Resend(key);
      const res = await resend.emails.send({
        from: FROM(),
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
      });
      if (res.error) throw new Error(`Resend: ${res.error.message}`);
      return { delivered: true, id: res.data?.id };
    },
  };
}

let provider: EmailProvider | undefined;
function getProvider(): EmailProvider {
  if (!provider) provider = buildProvider();
  return provider;
}
/** Test hook: inject a capture provider. */
export function __setEmailProviderForTests(p: EmailProvider | undefined) {
  provider = p;
}

const FOOTER =
  '\n\n—\nFamily Case Review is a service of Snot Nose Legal — snotnoselegal.com. We are not a law firm and this is not legal advice. Questions? Just reply to this email.';

async function send(msg: EmailMessage): Promise<{ delivered: boolean; id?: string; error?: string }> {
  try {
    return await getProvider().send({ ...msg, text: msg.text + FOOTER });
  } catch (e) {
    // ENG-9: a failed send is an operational event, never a crashed request.
    // The provider's message is returned so the ops console can show it —
    // Resend error text is diagnostic, never a secret.
    console.error('[email] send failed:', (e as Error).message);
    return { delivered: false, error: (e as Error).message };
  }
}

/** Ops diagnostic (ops_console_redesign.md J2): prove the transport end to end. */
export function sendTestEmail(to: string) {
  return send({
    to,
    subject: 'Family Case Review — email transport test',
    text: `This is a test message from the operations console, sent ${new Date().toISOString()}. If you are reading it, transactional email is working.`,
  });
}

export function sendReceipt(to: string, opts: { amountCents: number; caseUrl?: string }) {
  return send({
    to,
    subject: 'Your Family Case Review — payment received',
    text: `Thank you. Your payment of $${(opts.amountCents / 100).toFixed(2)} is received and your case is set up.

What happens next: confirm a few details about the case (most are already filled in from your free check), and we'll build your personal document checklist — with help for getting every document on it. Send documents at your own pace; your review clock only starts when you tell us your records are complete.${
      opts.caseUrl ? `\n\nYour case: ${opts.caseUrl}` : ''
    }`,
  });
}

export function sendRecordsComplete(to: string, opts: { expectedReadyBy?: string; statusUrl?: string }) {
  return send({
    to,
    subject: 'Your documents are complete — your review has started',
    text: `Your documents are in and your review has started.${
      opts.expectedReadyBy ? ` Expect your report by ${opts.expectedReadyBy}.` : ''
    }

We'll email you as your review moves through each step, and you can watch progress any time${
      opts.statusUrl ? ` here: ${opts.statusUrl}` : ' on your case page'
    }. A trained legal reviewer checks every report before it reaches you.`,
  });
}

/** E-1: some scans could not be read well enough — the family needs to decide. */
export function sendNeedsYou(to: string, opts: { documentsUrl: string }) {
  return send({
    to,
    subject: 'We need your help with some pages',
    text: `Some of the pages you sent were too hard for us to read reliably, so we've paused before spending your review on them. Your review is safe and nothing is lost.

What to do: open your documents page and look for the pages we flagged. If you can get a cleaner copy (the clerk can often reprint), upload it. If not, tell us to go ahead with what we have.

${opts.documentsUrl}`,
  });
}

/** OPS-7: a delay on our side, said plainly, with the new date. */
export function sendDelayOurs(to: string, opts: { newDate: string; statusUrl: string }) {
  return send({
    to,
    subject: `Your review is delayed on our side — new date ${opts.newDate}`,
    text: `We've hit a delay on our side with your review. This is on us, not on you or your documents.

New expected date: ${opts.newDate}. You don't need to do anything. Your progress page has the latest:
${opts.statusUrl}`,
  });
}

/** OPS-2: a refund was issued — say how much, and when it lands. */
export function sendRefundIssued(to: string, opts: { amountCents: number; partial: boolean; caseUrl: string }) {
  return send({
    to,
    subject: `Refund issued — $${(opts.amountCents / 100).toFixed(2)}`,
    text: `We've issued a refund of $${(opts.amountCents / 100).toFixed(2)} to the card you paid with. It usually appears in 5–10 business days depending on your bank.${
      opts.partial
        ? ' Your review continues; this refund is for the part we could not deliver.'
        : ' Your review is closed. Any report you already received stays available to you.'
    }

Your case: ${opts.caseUrl}`,
  });
}

export function sendReportReady(to: string, opts: { caseUrl: string }) {
  return send({
    to,
    subject: 'Your report is ready',
    text: `Your case review is complete, checked by a trained legal reviewer, and ready for you to read.

Read it when you're ready — it will be right there when you are, and some families choose to read it together: ${opts.caseUrl}

Whatever it says, there is a next step, and the report walks you through it.`,
  });
}

export function sendQualityHold(to: string, opts: { caseUrl: string }) {
  return send({
    to,
    subject: 'A specialist is giving your review a closer look',
    text:
      "Good news and a small pause: our automated quality check flagged something in your review that we want a person to verify before you see it. Nothing is wrong with your case — this is the system being careful.\n\n" +
      'A trained legal reviewer is checking it personally. Expect your report within 24 hours.\n\n' +
      `You can watch progress any time: ${opts.caseUrl}`,
  });
}

export function sendFeedbackFollowup(to: string, opts: { surveyUrl: string }) {
  return send({
    to,
    subject: 'One quick question about your report',
    text:
      "It's been about a week since your Family Case Review report was ready. However it turned out, we want to know if we did our job well.\n\n" +
      'Two quick questions (30 seconds, no sign-in tricks — the link opens your report page):\n' +
      `${opts.surveyUrl}\n\n` +
      'Thank you — every answer is read personally.',
  });
}

/**
 * Staff invite (auth design §4.6, staff_console_access_model §7.2): sent when
 * an Admin creates an account. The link sets the first password; the copy
 * explains how sign-in works from then on and what they will see.
 */
export function sendInvite(
  to: string,
  opts: { name?: string | null; roleLabel: string; whatYouSee: string; setupUrl: string; signInUrl: string; invitedBy: string; hours: number }
) {
  return send({
    to,
    subject: 'You have been added to the Family Case Review console',
    text: `${opts.name ? `Hi ${opts.name},` : 'Hello,'}

${opts.invitedBy} added you to the Family Case Review console as ${opts.roleLabel}.

To get in:

1. Set your password (this link works for ${opts.hours} hours):
   ${opts.setupUrl}

2. From then on, sign in with this email address at:
   ${opts.signInUrl}

What you will see: ${opts.whatYouSee}

If the link has expired, ask the person who added you to resend it. If you were not expecting this, you can ignore this email — nothing is active until a password is set.`,
  });
}

/** US-6: a paid re-run reopened the case for documents. */
export function sendRerunPurchased(to: string, opts: { documentsUrl: string }) {
  return send({
    to,
    subject: 'Your re-run is paid for — add your new documents',
    text: `Thank you. Your case is open again for documents.

Your earlier report still stands. Add the new documents here, then press "Start the re-run":
${opts.documentsUrl}

Everything you told us about the case is already saved — you will not be asked those questions again.`,
  });
}

/** G-E1: a pending-appeal family asked us to check back. Sent right away. */
export function sendCheckBackLater(to: string, opts: { checkUrl: string; months: number }) {
  return send({
    to,
    subject: "We'll check back when the appeal is decided",
    text: `Thanks for checking. While a direct appeal is still being decided, a writ filed now would be dismissed — so this isn't the moment, and we won't take your money for a review that can't help yet.

We'll email you once, in about ${opts.months} months, to ask whether the appeal has been decided. If it is decided sooner, come back any time:
${opts.checkUrl}

That's the only email you'll get from this. Reply to this message if you'd rather we didn't send it.`,
  });
}

/** G-E1: the one reminder, ~90 days on. */
export function sendPendingAppealReminder(to: string, opts: { checkUrl: string }) {
  return send({
    to,
    subject: 'Has the appeal been decided?',
    text: `A few months ago you told us a direct appeal was still being decided. If it has been decided since — denied or affirmed — the conviction is final and a review can help now.

Take the free two-minute check again (your earlier answers are not stored):
${opts.checkUrl}

If the appeal is still pending, nothing to do. This is the only reminder we send.`,
  });
}

/** Email change (your_account U5): the new address confirms; the old one is told. */
export function sendEmailChangeConfirm(to: string, opts: { confirmUrl: string }) {
  return send({
    to,
    subject: 'Confirm your new email address',
    text: `Someone — we hope you — asked to move a Family Case Review account to this address.

Confirm it here (the link works for 24 hours):
${opts.confirmUrl}

If this wasn't you, ignore this message and nothing changes.`,
  });
}

export function sendEmailChangeNotice(to: string, opts: { newEmail: string }) {
  return send({
    to,
    subject: 'Your account email is changing',
    text: `A request was made to change the email on your Family Case Review account to ${opts.newEmail}. Nothing changes until that address confirms.

If this wasn't you, sign in and change your password now, then reply to this email so we can help.`,
  });
}

/** Staff notification (staff_console_access_model §6): one email per request. */
export function sendStaffRequest(
  to: string,
  opts: { kind: string; caseTitle: string; requestedBy: string; reason: string; note?: string | null; consoleUrl: string }
) {
  const what = opts.kind === 'REFUND' ? 'a refund' : opts.kind === 'CASE_DELETE' ? 'a case deletion' : 'an account deletion';
  return send({
    to,
    subject: `Approval needed — ${what} for ${opts.caseTitle}`,
    text: `${opts.requestedBy} is asking for ${what} on "${opts.caseTitle}".

Reason: ${opts.reason.replace(/_/g, ' ')}${opts.note ? `\n"${opts.note}"` : ''}

Decide in the console: ${opts.consoleUrl}`,
  });
}

export function sendPasswordReset(to: string, opts: { resetUrl: string }) {
  return send({
    to,
    subject: 'Reset your password',
    text: `Someone asked to reset the password for this account. If that was you, use this link within the next hour:

${opts.resetUrl}

If it wasn't you, you can ignore this email — your password is unchanged.`,
  });
}
