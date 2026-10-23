# Unauthorized Practice of Law review — 2026-10-23

**Status:** findings for founder and Texas counsel · **Full report (doc):** https://claude.ai/artifact/MpTmHgT3TFo6fYuobEphcq · **Code reviewed:** `main` at 23 October 2026 (persona build merged, every professional surface dark behind flags).

This file is the repository copy of the report's risk table and recommendations so that agents can work from it as a brief. The doc carries the law, the method, the full findings with evidence, and the questions for counsel. Statute citations are from the author's knowledge and must be confirmed by Texas counsel before reliance.

## Verdict

The product is built on the right principle (describe the record, send the family to a lawyer) but in several places it speaks as a lawyer would: merit opinions, timing and remedy conclusions, deadline verdicts, and a claim that a "trained legal reviewer" approved the report when no licence is required of anyone who does. On the professional tier nothing checks that the recipient of lawyer-only output is a lawyer, and two templates speak in counsel's name. Nothing is live for customers yet; all of it must change before January.

## Risk table

| # | Severity | Finding | Where | Fix |
| --- | --- | --- | --- | --- |
| E1 | High | Bottom line gives merit opinions and tells low-tier families a lawyer "would likely say the same" | `packages/case-lifecycle/bottom-line.ts`, `issue-weight.ts` | Rewrite every tier as description; delete the dissuasion sentence; always end on "take this to a lawyer" |
| E2 | High | Part B, harm standard, vehicle and develop steps delivered to the family | `apps/api/src/routes/intake.ts`, `packages/reports/family-report.ts`, report page | Split the deliverable (Part A to the family, sealed attorney packet), pending counsel question 3 |
| E4 | High | "Approved by a trained legal reviewer" on report, emails and tracker; reviewer needs no licence; same email on the auto path | `report/page.tsx`, `packages/email/index.ts`, `apps/web/lib/tracker.ts`, `apps/api/src/routes/permissions.ts` | One truthful sentence everywhere; record the licence of staff who edit legal text; different email on auto-approve |
| E5 | High | Deadline conclusions ("CLOSED", "N days remain", "claims left out are lost") and an unsupported "§4 exceptions marked" sentence | `family-report.ts`, `report/page.tsx` | Keep the arithmetic; print the rule and the dates given; delete the unsupported sentence |
| E6 | High | Free check decides timing and remedies ("would be dismissed", "generally unavailable", "most winnable claims") | `apps/web/app/(daybreak)/check/page.tsx`, `packages/email/index.ts` | Outcomes say product fit only; remove the three sentences; statement on the outcome screens |
| E3 | High | Prompts ask for Strickland prongs, preservation calls and relief-based severity with no advice limit on Part B | `apps/api/src/services/analysis.service.ts` | Keep for counsel; add "describe, never advise, never address the family" and an advice-language lint |
| F1 | High | Held out as a lawyer's assessment, "signed off by a licensed Texas attorney", "human review" in the Stripe line item | `landing.ts`, `home.ts`, `about.ts`, `checkout.ts` | Remove the sign-off claim until counsel signs; drop lawyer comparisons; fix the line item |
| F3 | High | Tracker and emails promise a trained legal reviewer | `tracker.ts`, `email/index.ts` | Same sentence as E4 |
| F4 | High | No Spanish disclaimer on check, buy, report, emails or PDF; Spanish copy says "qualifies" and "worth filing" | content files, `SiteFooter.tsx`, `buy/page.tsx` | Translate the statement and buy cards; correct the phrases; remove the "whole site" claim |
| P1 | High | Any string passes as a bar number; rejection changes nothing; packet says "at counsel's direction" | `counsel.ts`, `ops-professional.ts`, `counsel-packet.ts` | Gate matters, quotes and the packet on `barVerifiedAt`; rejection closes counsel review; match the emails |
| P2 | High | Viewer and investigator seats receive the packet, postures and clock | `counsel-packet.ts`, `matters.ts`, `counsel-checkout.ts` | Role check on every counsel route: lawyer seats only for Part B, postures, clock, templates |
| P3 | High | Self-declared clinics receive the full family report; consent promised Part B only | `packets.ts`, `apps/web/lib/counsel.ts`, next-steps page | Staff-verified CLINIC kind with supervising attorney on file; deliver what the consent says; fix the copy |
| P4 | High | 47.2(e) block attests for counsel and is false when case names print; W.D. Tex. certificate drafted in the first person | `packages/reports/disclosures.ts`, `trap/anders.ts` | Neutral "what the tool did" statement; strip case names from printed Anders text; templates off until counsel approves |
| P5 | High | 11.07 bar stated as "Applies" on an assumed fact; marketed exhaustion map not produced | `counsel-packet.ts`, `counsel-packet.service.ts`, `posture-11-07.ts`, `professional.ts` | Print inputs and rule, not a verdict; capture the missing fact; remove the exhaustion claim |
| F2 | High | Merit judgments in marketing; sample report argues in a lawyer's voice | `landing.ts`, `site-faq.ts`, `sample-report.ts` | Describe, do not weigh; rewrite the sample in the report's register |
| E7 | Medium | Service picks the writ vehicle and shows it as the family's writ type | `facts.ts`, interview and documents pages | Reword as how the review reads the record; a lawyer decides the filing |
| E8 / P7 | Medium | Statutory words absent; PDF footer 6.5 pt; no statement on the packet | `pdf-helpers.ts`, `disclosures.ts`, every page | One statement, statutory words, cover and every page at body size, both languages, from the shared constant |
| P6 | Medium | Client letter in the counsel packet is the vendor advising a represented client | `counsel-packet.ts`, `bottom-line.ts` | Text counsel adopts and signs, or remove until counsel rules |
| P8 | Medium | Clock says "Missed" on proposed vectors; marketing says the user signs them | `TrapClockCard.tsx`, `professional.ts` | "Appears missed on the dates given"; correct who signs |
| P9 | Medium | Marketing outruns the product (exhaustion map, Anders "with a cite", E&O "being bound") | `professional.ts` | Sell only what ships |
| P10 | Medium | Record Desk and QA edits unbounded, reviewers unlicensed | `investigations.ts`, `qa.ts`, record-desk pages | Chronology template; licence recorded for anyone editing legal text |
| F5 | Medium | Many pages rely on an English-only footer; no AI label in the PDF | listed pages, `family-report.ts` | Statement in the page body; AI label on the PDF cover |
| F6 | Medium | No Terms or Refund Policy page; disclosures and privacy still draft | `apps/web/app` | Publish both; counsel signs the drafts |
| E9 | Low | Drafting personas in the repository | `packages/ai/personas.ts` | Delete or move out of the product tree |
| F7 | Low | Two referral links point to the Bar homepage without the no-consideration sentence; clinic card lacks R-7 | `report/page.tsx`, `check/page.tsx`, next-steps page | Point to the certified service; add the sentences |
| P11 | Low | Referrals and partner code clean; directory only in a document | `next-steps/page.tsx`, `promotions.ts` | No change; keep the directory out of code until counsel rules |
| F8 | Low | Shared disclaimer constant unused | `packages/case-lifecycle/brand.ts` | Every surface imports it |

## Recommendations, in order

1. One truthful statement, statutory words, everywhere, both languages, from `packages/case-lifecycle/brand.ts`; AI label on the PDF cover; a test that fails when a page renders without it. (Agent, this week.)
2. Stop saying a legal reviewer approved the report; fix the Stripe line item; distinct email on auto-approve; remove "signed off by a licensed Texas attorney" until true. (Agent, this week.)
3. Rewrite bottom line, weight legend, check outcomes and deadline section as description; Spanish says "fits", never "qualifies" or "worth filing". (Founder drafts, agent ships, counsel signs.)
4. Gate every lawyer-only `/counsel` output on `barVerifiedAt` plus an OWNER or ATTORNEY seat; rejection closes counsel review; staff-verified clinics; inbox delivers what consent names. (Agent, this week.)
5. Counsel decides whether a family may receive Part B at all (question 3) before anything further is built on the report.
6. Professional outputs describe, not conclude: 11.07 posture prints inputs and rule; exhaustion map withheld; clock says "appears missed"; Anders prints no case names. (After counsel's answer to question 11.)
7. Withhold the 47.2(e) block and the W.D. Tex. certificate; one third-person tool statement instead; 9.1(d) list keeps its "proposed" heading. (Counsel decides, agent ships.)
8. Settle the client letter: counsel adopts and signs, or drop it. (Counsel.)
9. Record a bar number for staff who edit legal text or work the Record Desk; QA edit route requires it; chronology template for Record Desk deliverables. (Founder.)
10. Publish Terms and Refund Policy pages; counsel signs disclosures and privacy; correct the product name. (Founder and counsel.)
11. Advice-language lint on Part A and Part B; prompt rule "describe, never advise, never address the family". (Agent.)
12. Hygiene: delete CREAC/clemency personas; referral links to the certified service with the no-consideration sentence; R-7 on the clinic card; remove the exhaustion map and E&O line from `/for-counsel`; correct "proposed until you sign them". (Agent.)

## Questions for Texas counsel

See the doc, section "Questions for Texas counsel" (13 items): statute text, where describing ends and advising begins, whether a family may receive Part B, licence for human reviewers, the free-check outcomes, professional-tier gates, clinics as law practices, the client letter, the disclosure templates, partner codes and the planned directory, the 11.07 and §2254 outputs, TRAIGA, and Spanish.
