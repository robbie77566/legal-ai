# Bulk ZIP Upload, Live Check-off & Informed Run-Anyway Consent

**Prepared:** 2026-09-01 · **Status:** Implemented with this document · **Persona anchor:** a family member with a phone or an old laptop and a folder (or shoebox) of court papers — transcripts alone are often dozens of files. Making them upload one checklist item at a time is friction we pay for in abandoned cases.

## 1. The user story (PO request, 2026-09-01)

> Rather than go through the document checklist item by item, let the user upload a **ZIP file** — and explain what that is and how to make one. During ingestion, **check off the needed documents automatically** as they are recognized. Then ask the user to locate and upload the remaining documents — as another bulk file, or as a single PDF if it's just one or two. If they don't have any more (or got all they could), ask whether they'd like to **run the analysis anyway**, confirming they'll have to pay per analysis run, since each run costs money to execute.

## 2. UX flow (documents page, S2/S3)

1. **ZIP card first** ("Have a lot of files? Send them all at once"): plain-words definition ("one file that holds many files inside it — like a folder squeezed into a single package") + a collapsible per-device how-to (Windows *Send to → Compressed (zipped) folder*, Mac *Compress*, iPhone Files-app *Compress*, Android Files-by-Google *Compress*), and the format expectation (PDF + photos inside; anything else skipped and said so). Per-item and shoebox uploads stay — the ZIP is an addition, not a replacement.
2. **Unpack progress:** "We're opening your file… you can leave this page; nothing is lost." The page polls the checklist until the unpack summary lands, then keeps a bounded polling budget so **echo-back classifications check items off live** (the existing digitize → classify → item `UPLOADED` pipeline, unchanged — every ZIP entry becomes an ordinary Document).
3. **Unpack summary, honest:** "N documents added" + skipped counts with reasons (unsupported format / size / unreadable) and "skipped files never cost you anything."
4. **The remaining-documents nudge:** once files exist and items are still `NEEDED`, name the gaps. ≤2 missing → "upload each one on its own — a single PDF or a few photos"; 3+ → "put them all in one ZIP and send them in one go." Both point at the per-item "how to get it" notes.
5. **Informed run-anyway consent:** with gaps open, the primary button reads "That's everything I could get — start the review" and opens a confirmation that states, BEFORE the click: the missing items by name; that many families can't get everything and that's okay; that **the purchase includes one full analysis which runs on only what's uploaded now**; and that **a later analysis with newly found documents costs $99** (the re-run price, §4 pricing) because each run costs real computer time. Explicit back-out ("Wait — I'll keep collecting documents"). A fully satisfied checklist keeps the direct one-click button — no consent detour.

## 3. Engineering

- **Transport:** the archive rides the existing presign → S3 PUT → `/upload/complete` path. `/upload/complete` detects `.zip`, registers **no Document** (the archive is a container), and enqueues a `zip` queue job (jobId = hash of the s3Key — a double-registration can never unpack twice). 503 with a plain retry message if Redis is down.
- **Worker** (`zip.worker.ts`, concurrency 1): `ingestZip` downloads the archive, plans entries (pure `planZipEntries`, unit-tested), uploads each accepted entry under a fresh `cases/<caseId>/<uuid>-<basename>` key, creates the Document + `doc.uploaded` event, and enqueues digitization — so malware scan, page ledger, duplicate pricing, OCR-halt, and echo-back all apply per entry unchanged. One `zip.ingested` event (counts only — filenames are PII) closes the job; the checklist GET returns the latest as `lastZip`.
- **Safety model:** extension allowlist (= the single-file picker's), junk pruning (directories, `__MACOSX`, dotfiles, zero-byte), **no nested zips** (one level, deliberately), and zip-bomb bounds — 250MB compressed, 300 entries, 150MB/entry uncompressed, 1.5GB total uncompressed. Zip-slip is structurally impossible: entry names never become paths. Caps hit → entries are *skipped and reported*, never a crash.
- **Memory note (deliberate):** adm-zip holds the archive in memory; concurrency 1 + the 250MB cap fit the Render starter instance (512MB). Raising the cap requires a streaming unzip (yauzl) or a bigger instance first — recorded as the upgrade trigger in `external_services.md` terms.
- **Retry semantics:** BullMQ retries a crashed job; the worst duplicate is a re-registered file, which the page-ledger duplicate detection already prices at zero.

## 4. Tests

`apps/api/tests/zip-ingest.test.ts` (plan logic: formats, junk, bomb bounds, entry cap, strict counts-only event) · `apps/web/tests/unit/DocumentsPage.test.tsx` (ZIP card + explainer, unpack summary honesty, still-needed nudge, $99 consent gate posts records-complete only after confirm, back-out runs nothing, satisfied checklist skips the consent).

## 5. Out of scope, tracked

Streaming unzip for >250MB archives (needed only if real customers hit the cap); RAR/7z (tell the user we take ZIP); Spanish for the case surfaces (the whole signed-in area is the recorded i18n P1 gap — these new strings join it); a server-side "which checklist items did THIS zip satisfy" diff (the live check-off communicates it today).
