# The counsel packet

**Date:** 2026-10-19 · **Plan:** `docs/implementation/persona_rollout_plan.md` §3 (writ practitioner, PD appellate attorney), §5 E, January slice · **Trust posture:** `docs/business_case/attorney_offering_and_pricing.md` ("the verification posture should ship in the packet").

A counsel matter's deliverable is a packet built for a brief, not a family letter. Part B comes first; the Part A client letter is optional and last, so the lawyer decides whether to hand it over. The packet emits **record citations and doctrine categories, never case citations** — that is what keeps it on the right side of every sanction the research found, and the first-page disclosure says so in as many words.

Renderer: `packages/reports/counsel-packet.ts` (`renderCounselPacketPdf`, `counselPacketSections` — the same content as JSON, in packet order, for the web page and the tests). Disclosure instruments: `packages/reports/disclosures.ts`. Routes: `apps/api/src/routes/counsel-packet.ts`; input built by `apps/api/src/services/counsel-packet.service.ts`. Template version `counsel-v1`, stamped on the cover beside the released report's own template (`AB-v2`). The family renderer moved to `packages/reports/family-report.ts` unchanged; the palette, footer and header both renderers share live in `pdf-helpers.ts`.

## Sections, in order

| # | Section (`id`) | What it holds | Status |
|---|---|---|---|
| a | `cover` | Vehicle label, county, court, cause number, **client initials only**; the organisation; "Prepared at counsel's direction for counsel's use."; report id, version, rendered date, `counsel-v1` over the report template; republish change notes. The work-product footer is on every page. | shipped |
| b | `disclosure_47_2e` | First page, under the cover: "Use of Generative Artificial Intelligence" in the N.D. Tex. L.Cr.R. 47.2(e) format — names the tool (the product, never a model), states that every record citation was re-verified against the record at render (with the verified/dropped counts), and that the document cites no judicial decisions or other legal authorities. | **draft — for counsel review**; `reviewedBy` empty |
| c | `inventory` | From `inventory()` (workstream D): volumes with file count, billable pages and page-weighted OCR confidence, each file's label (or filename when unlabelled), missing volumes in the numbered sequence, unlabelled files, the metered pages per kind and the bucket. "Anything not listed here was not reviewed." | shipped |
| d | `trap_chain` | `computeTrapClock(trapInputsForMatter(...))`: each step with rule, due date, status (`done`/`open`/`missed`/`not yet`), late flag, **jurisdictional / discretionary**, the vector's confidence and its basis line; next due; the missed-jurisdictional warning; the clock's notes. When `unsignedCount > 0` (today: always) the banner reads *"Deadline vectors proposed; counsel-signed vectors pending (n of m steps unsigned)…"*. | vectors **proposed** until counsel-signed (`packages/case-lifecycle/trap/README.md`) |
| e | `part_b` | Findings grouped by screen (`Finding.screen`, else the category), the vehicle's weighted screens first (`VEHICLES[v].weightedScreens`), dispositive before supportive before background. Each: category and severity, the record cite as *volume · page · line*, the **"Verified against record at render"** mark, confidence, the Part B text, preservation · vehicle · harm standard, "to develop", "depends on records not provided", every citation with its verbatim excerpt. Then **"Dropped at verification (n)"**: every snapshot finding that failed FR-7 at this render, listed by category, severity and cite location — the excerpt is not reproduced. Never silently removed. | shipped |
| f | `anders_appendix` | Direct-appeal matters only. Every `ANDERS_CHECKLIST` item with the retained findings whose screen maps to it (`andersItemsForScreen`), "No finding on this record." where none, "Process item" for counsel's own steps. The checklist's `source` lines (its provenance for the signer) are **not** printed: the packet carries no case citations. Banner: a record of process, never a certification that the record shows no error. | items **proposed** until an appellate lawyer signs |
| g | `posture_1107` | Writ matters (`11.07`, `11.072`, `11.09`): `posture1107` as data lines — authority, prior applications, subsequent-application and §4 bar, the exceptions when the bar applies, one-shot, the complete-inventory warning, premature filing, no rehearing. `exhaustion_2254` (the §2254 map) renders only when the matter carries grounds data — February. | **proposed** |
| h | `verification_log` | Every record citation in the packet, once, with its volume/page/line and *verified at render* or *dropped*; totals. Drafted to the **proposed** TRAP 9.1(d) representation that "record citations are not fabricated"; headed **"Proposed; finalisation pending"** until a final order issues (plan §7 Deepen gate: wording matched to the rule in force). | **draft** |
| i | `wd_tex_certificate` | Optional (`?wdtex=1`): a certificate of independent verification in the W.D. Tex. standing-order format, with blanks for counsel's signature, bar number and date. | **draft — for counsel review**; off by default |
| j | `client_letter` | Optional (`?clientLetter=1`): the Part A letter, **last**, rendered by the family renderer's own content path (`renderFamilyReportBody`) with the family voice — About this case, the bottom line, the findings in plain English. Counsel decides whether, and in what form, to hand it over. | off by default |

### The verified-against-record mark

The renderer never computes the mark. The api runs FR-7 (`verifyFindings`, the same call the family report makes at every render) and hands the renderer two lists, `findings` (verified) and `droppedFindings`; the mark is true for every finding in the first list because it is in that list, and the second list is printed under "Dropped at verification" and in the 9.1(d) log as `dropped`. A finding cannot be marked verified by a flag, and a dropped one cannot vanish.

## Routes

Both at `/counsel/matters/:caseId/…`, under the matter routes' hooks: `counsel_surfaces` flag (404 when off), `PROFESSIONAL` with a live seat (403), organisation-scoped (another organisation's matter is 404). `409 { reason: 'NO_RELEASED_REPORT' }` before QA has released a report — the packet is built from the released report version the family route serves (`?version=` picks an earlier one).

- `GET …/packet.json` → `{ caseId, reportId, versionNo, templateVersion: 'counsel-v1', sections }`
- `GET …/packet.pdf` → the PDF, `attachment; filename="counsel-packet-<caseId>-v<n>.pdf"`

Switches: `clientLetter=1`, `wdtex=1`. Every fetch writes a `PACKET_DOWNLOAD` audit row with `{ format, versionNo, clientLetter, wdtex, organisationId }` — ids and switches only, never initials, a cause number or a county.

The ops case file (`GET /ops/cases/:id/file`) now says which deliverable a case gets: `case.variant: 'family' | 'counsel'` (derived from the Matter row; no new column) and `case.matterVehicle`; the ops case page shows a COUNSEL PACKET chip. Workstream F's matter page links to `packet.pdf`.

## Proposed, draft, pending

Nothing in the packet is signed yet. Where each piece stands and what moves it:

| Piece | Where it lives | How it is finalised |
|---|---|---|
| 47.2(e) disclosure text, W.D. Tex. certificate text | `packages/reports/disclosures.ts` (`status: 'draft'`, `reviewedBy` empty) | A lawyer reviews the wording against the rule and the standing order and sets `reviewedBy: '<name, bar number>'`; the packet then prints "Reviewed by …" instead of the DRAFT banner. |
| 9.1(d) log wording | `TRAP_9_1_D_LOG` in the same file ("Proposed; finalisation pending") | Matched to the rule in force when the Supreme Court of Texas issues a final order (plan §7, Deepen). |
| TRAP vectors, holiday table | `packages/case-lifecycle/trap/trap-chain.ts`, `rule-4-1.ts` | The sign-off procedure in `trap/README.md`; the banner disappears when `unsignedCount` reaches zero. |
| Anders checklist items, 11.07 posture rule | `trap/anders.ts`, `trap/posture-11-07.ts` | Same procedure; `confidence: 'signed'` per item. |

## Tests

- `packages/reports/tests/counsel-packet.test.ts` — E7 every section in order on a Gary-shaped direct-appeal fixture, the optional pages only when asked, the footer on every page (text read from an uncompressed PDF by `tests/pdf-text.ts`); E8 dropped findings listed as dropped and never in Part B, the mark on every retained finding, the 9.1(d) log once per cite; E9 the proposed-vectors banner, the Anders appendix omitted for 11.07 with the posture section present, the §2254 map only with grounds.
- `apps/api/tests/counsel-packet.integration.test.ts` — E10 the routes: 200 JSON and PDF with a released report (FR-7 drops a tampered citation), 409 before release, 403 FAMILY, 404 flag off, 404 another organisation, the audit row, the ops `variant`.
- E11: `packages/reports/tests/render.test.ts` and the api report suites (`intake`, `support`, `report-republish`, `analysis`, `clinic-inbox`) pass unchanged — the family PDF is rendered by the same code, moved, not edited.

## February (not here)

Grounds grouping with the §4 tag and the CCA-form item mapping, affidavit topics from the IAC screen, the TRAP 48.4 checklist, the §2254 exhaustion map fed from the matter's grounds. DOCX/CSV exports are workstream H; the web page that shows the packet is workstream F.
