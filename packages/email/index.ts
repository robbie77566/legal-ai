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
  send(msg: EmailMessage): Promise<{ delivered: boolean; id?: string }>;
}

const FROM = () => process.env.EMAIL_FROM ?? 'Family Case Review <noreply@snotnoselegal.com>';

function buildProvider(): EmailProvider {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      async send(msg) {
        console.warn(`[email] RESEND_API_KEY not set — NOT delivered: "${msg.subject}" → ${msg.to}`);
        return { delivered: false };
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

async function send(msg: EmailMessage) {
  try {
    return await getProvider().send({ ...msg, text: msg.text + FOOTER });
  } catch (e) {
    // ENG-9: a failed send is an operational event, never a crashed request.
    console.error('[email] send failed:', (e as Error).message);
    return { delivered: false };
  }
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

export function sendPasswordReset(to: string, opts: { resetUrl: string }) {
  return send({
    to,
    subject: 'Reset your password',
    text: `Someone asked to reset the password for this account. If that was you, use this link within the next hour:

${opts.resetUrl}

If it wasn't you, you can ignore this email — your password is unchanged.`,
  });
}
