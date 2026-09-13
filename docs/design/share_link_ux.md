# Share-with-a-lawyer link

## Share-with-a-lawyer link: it can now leave the page (PO, 2026-09-13)

The link could be created but only read off the screen — no copy, no send. The next-steps page now offers **Copy link** (clipboard, with a press-and-hold fallback note), **Send by email** (a mailto with the link, the expiry date and the no-privilege line), and **Share…** (the phone's share sheet, only when the browser has one), plus **Works until <date>** and **Turn the link off** (revoke). Because the raw token is never stored, a link made on an earlier visit is shown as status only — created, expires, opened N times — with *Create a new link*, which revokes the old one first so one link is live at a time. Tests: `NextStepsShare.test.tsx`.
