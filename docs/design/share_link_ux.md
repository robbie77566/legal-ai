# Share-with-a-lawyer link

## Share-with-a-lawyer link: it can now leave the page (PO, 2026-09-13)

The link could be created but only read off the screen — no copy, no send. The next-steps page now offers **Copy link** (clipboard, with a press-and-hold fallback note), **Send by email** (a mailto with the link, the expiry date and the no-privilege line), and **Share…** (the phone's share sheet, only when the browser has one), plus **Works until <date>** and **Turn the link off** (revoke). Because the raw token is never stored, a link made on an earlier visit is shown as status only — created, expires, opened N times — with *Create a new link*, which revokes the old one first so one link is live at a time. Tests: `NextStepsShare.test.tsx`.

## Delivering the packet to a clinic (workstream I, 2026-10-19)

The consent card on the next-steps page ("Share with an innocence clinic") now does two more things when at least one clinic has a live inbox (`clinic_inbox` on for that clinic's organisation; `GET /cases/:id/packets/clinics` answers the list):

1. **Which clinic?** — a picker above the consent switch, defaulting to *Any innocence clinic* (the consent as it always was). Choosing a clinic stores it on the grant (`ConsentGrant.recipientOrganisationId`), and the switch reads *Consent is ON — sharing allowed with <clinic>*. The picker disappears while consent is on; turning consent off revokes every active clinic grant at once, named or not.
2. **Send the packet to <clinic>** — shown once consent names a clinic. It posts `POST /cases/:id/packets/deliver`; the API writes one `PacketDelivery` row into the clinic's tenant pointing at the current released report. Nothing is uploaded or copied: the clinic reads the same PDF through its inbox (`GET /counsel/inbox`, `GET /counsel/inbox/:id/report.pdf`), and every open re-checks the consent — a revoked consent answers 410 and the inbox row says *revoked*. The family sees "Sent." (or "already has this packet"), and a `packet.opened` event lands on the case when the clinic first opens it, so the next-steps page can show it like the share-link opens count (follow-up: surface the open on the card).

Without a live clinic the card is exactly what it was: one switch, class-wide consent. Tests: `apps/web/tests/unit/NextStepsClinic.test.tsx`; API `apps/api/tests/clinic-inbox.integration.test.ts`.
