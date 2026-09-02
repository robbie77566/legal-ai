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
        console.warn(`[email] RESEND_API_KEY not set — NOT delivered: "${msg.subject}" → ${msg.to}`);
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
  '\n\n—\nFamily Case Review is a service of Snot Nose Legal. We are not a law firm and this is not legal advice. Questions? Just reply to this email.';

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

export function sendReceipt(to: string, opts: { amountCents: number }) {
  return send({
    to,
    subject: 'Your Family Case Review — payment received',
    text: `Thank you. Your payment of $${(opts.amountCents / 100).toFixed(2)} is received and your case is set up.

What happens next: sign in, answer a few short questions about the case, and we'll build your personal document checklist — with help for getting every document on it. Send documents at your own pace; your review clock only starts when you tell us your records are complete.`,
  });
}

export function sendRecordsComplete(to: string, opts: { expectedReadyBy?: string }) {
  return send({
    to,
    subject: 'Your documents are complete — your review has started',
    text: `Your documents are in and your review has started.${
      opts.expectedReadyBy ? ` Expect your report by ${opts.expectedReadyBy}.` : ''
    }

We'll email you as your review moves through each step, and you can watch progress on your case page any time. A trained legal reviewer checks every report before it reaches you.`,
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
  return getProvider().send({
    to,
    subject: 'A specialist is giving your review a closer look',
    text:
      "Good news and a small pause: our automated quality check flagged something in your review that we want a person to verify before you see it. Nothing is wrong with your case — this is the system being careful.\n\n" +
      'A trained legal reviewer is checking it personally. Expect your report within 24 hours.\n\n' +
      `You can watch progress any time: ${opts.caseUrl}` +
      FOOTER,
  });
}

export function sendFeedbackFollowup(to: string, opts: { surveyUrl: string }) {
  return getProvider().send({
    to,
    subject: 'One quick question about your report',
    text:
      "It's been about a week since your Family Case Review report was ready. However it turned out, we want to know if we did our job well.\n\n" +
      'Two quick questions (30 seconds, no sign-in tricks — the link opens your report page):\n' +
      `${opts.surveyUrl}\n\n` +
      'Thank you — every answer is read personally.' +
      FOOTER,
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
