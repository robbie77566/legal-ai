# Gary (San Jacinto CR13893) — manual attorney-style review vs. engine output

**Date:** 2026-09-27 · **Manual review:** founder-supplied case summary & appeal analysis (nine issues, five RR volumes, no Vol. 6 exhibits) · **Engine output compared:** the recorded Gary runs in `compare_claude-fable-5_1788105664619.json` (Opus 5 champion, 22 findings; Fable 5 challenger, 39) and `compare_claude-fable-5_1788104981021.json` (Fable 5, 26) · **Ground truth:** `ledgers/gary.json` — five attorney-signed must-find canaries.

> The production engine is now Fable 5.1 and the eval gate has not yet been re-run on it (see `model_comparison_gary.md`, "Open before launch"). The recorded Fable 5 / Opus 5 runs are the closest proxy for what a customer report contains today; a fresh production report may differ at the margins.

## 1. The headline difference: the manual review stops at the verdict

The manual review analyses the guilt phase only. It records "Verdict: Guilty on both counts" and never mentions the sentence: **automatic life on each count under Tex. Penal Code § 12.42(c)(2), ordered consecutive, plus a $10,000 fine on each count.** Every dispositive finding the engine made lives in the punishment phase, and three of the five attorney canaries are punishment or enhancement issues.

| Engine finding (punishment / enhancement) | Opus | Fable | Manual review |
|---|---|---|---|
| $10,000 fine assessed on each count where § 12.42(c)(2) prescribes life and authorises no fine — illegal-sentence claim, cognizable at any time; punishment charge told the jury a fine "may be imposed" | dispositive | dispositive | absent |
| Multiple-punishments double jeopardy: indecency-by-contact subsumed in the sexual assault, same episode — **preserved** pre-charge, renewed, denied on a Blockburger rationale | dispositive | supportive | absent |
| Consecutive life sentences (State's motion to cumulate granted) | dispositive | background — Fable notes § 3.03(b)(2)(A) appears to authorise stacking for §§ 22.011/21.11 against a child | absent |
| § 12.42(c)(2) enhancement predicate: the 1986 pen packet (Cause 431106); print examiner Goodwin "can't compare it" on Ex. 39/40/41; Rule 901/902(4) authentication objection **preserved**; identity rested on FBI/SID/DL numbers | supportive ×3 | supportive ×3 | absent |
| Parole instruction (Art. 37.07 § 4(a) one-half/30 years) given where Gov't Code § 508.145(c) requires 35 calendar years for a § 12.42(c)(2) life sentence | — | background | absent |

For an Article 11.07 application the fine claim is close to mechanical (reformation of a void portion of the sentence), and the preserved double-jeopardy claim is the direct-appeal issue with the largest consequence (one life sentence, not two). The manual review's ranked table omits both.

## 2. Canary scorecard

| Attorney canary (`ledgers/gary.json`) | Manual review | Engine (both models) |
|---|---|---|
| Surrogate DNA analyst — Confrontation (Solis for Patnaik; Bullcoming / Smith v. Arizona) | **found** (Issue 1) | found |
| Double jeopardy — consecutive automatic life sentences | missed | found |
| 1986 pen-packet identity linkage under § 12.42(c)(2); fingerprint comparison declined | missed | found |
| Cell-site: Sheikh conceded non-expert; consumer-grade plotting admitted | missed | found |
| Unidentified caller (903 number) asserting recantation | missed | found |

Manual review: 1 of 5. Engine: 5 of 5 on both models.

## 3. The manual review's nine issues, one by one

| # | Manual issue | Engine | Difference |
|---|---|---|---|
| 1 | **Confrontation — Ex. 33 by non-testifying analyst.** Strongest issue; "Sitka (or Patnaik)"; Exhibits 33–37 admitted; cites Crawford / Melendez-Diaz / Bullcoming | Found (preserved, supportive 0.6–0.85). Adds: Solis performed **only** comparison/interpretation; screening by Patnaik (Ex. 33 and 35); extraction/quantification/amplification by a **third, unnamed** analyst ("I do not have her name with me"); cites **Smith v. Arizona (2024)**, the controlling case; Ex. 37 is a reissued report under DPS's Nov-2023 likelihood-ratio standard | Same issue, engine more precise on who did what and on the current authority. Severity differs: manual calls it strongest; engine rates it supportive because harm turns on the remaining DNA evidence — a materiality question neither side can resolve without Vol. 6 |
| 2 | **Suggestive photo array** — detective who knew the suspect built the array; no blind administrator; facial recognition funnel; Biggers / Brathwaite | Facial-recognition suspect development (Montgomery County analyst Hortman) found as background 0.4. **No** analysis of array administration, blind-administrator practice, or due-process suggestiveness | **Engine gap.** There is no identification-procedure screen. Note the manual's "no indication a blind administrator" is an inference from silence in the RR |
| 3 | **Hearsay — excited utterance / medical diagnosis.** Says no formal hearing was held and objections may be waived; identifies witnesses as Evan Perry, "Norma Carmona (Daisy's mother)", and "Jennifer Stutts (a nurse — Patti Schofield)"; notes age 16 so Art. 38.072 does not apply | Found the **preserved** remoteness objection to Jennifer Stutts's excited-utterance testimony (15–20+ minute interval, intervening events) — overruled, preserved. Also Perry's "back seat" vs. complainant's "passenger front seat" | **Conflict on preservation** (manual: possibly waived; engine: objected and overruled). **Conflict on witnesses**: engine has Carmona as a *forensic interviewer* ("3,427 interviews") giving class-based truthfulness testimony, and Jennifer Stutts and SANE nurse Schofield as two different people — the manual appears to conflate them. The 38.072 point appears only in the manual |
| 4 | **IAC** — failure to subpoena the actual analyst; no formal motion to suppress the identification | Six IAC findings, none of these two: punishment character witnesses (Araya, Rangel, Gatlin) unprepared for the prior sex-offence conviction; ~5-question cross of the sole occurrence witness; no 404(b) objection to "two homemade bombs"/counterfeit currency extraneous conduct; unobjected "no motive to lie means he's guilty" argument; unobjected community-expectation punishment argument; no follow-up on the 903 caller | **Disjoint.** Neither of the manual's IAC theories appears in the engine; none of the engine's six appear in the manual. Both sets are plausible 11.07 material |
| 5 | **Complainant's mental health — possible Brady.** Asks whether it was disclosed; frames as unknown | More specific: the prosecutor said on the record the **Burke Center** counselling records contain material "not very complimentary of my victim" / "she obviously has lots of problems" and declined to offer them; Jennifer Stutts admitted therapy-record entries ("Daisy is lying to you and you don't find out until later") | Engine answers the manual's open question: the records were in the State's possession **and at least partly known to the defence**, which moves the theory from Brady (suppression) toward IAC/strategy (why they were not used) |
| 6 | **Plea offer placed on the record** ("25 on one count, nolle the rest") — "unusual", possible misconduct | Not found | Engine gap, but low value: recording a rejected offer outside the jury's presence is standard post-*Lafler/Frye* practice to insulate against later IAC claims, not misconduct. The manual itself hedges |
| 7 | **Bolstering** — Freyer–Sheikh 2.5-year relationship, list of joint cases, "expert" in prior trials | Nothing on the relationship. Adjacent bolstering found: Carmona's class-based truthfulness testimony; Sheikh eliciting prior "expert" status on victim demeanor right after conceding "I'm probably not qualified" | **Engine gap** on relationship/vouching testimony specifically |
| 8 | **Alcohol as mechanism — no corroboration**; Valero video shows a vape pen, not alcohol | Found: no toxicology although SANE confirmed blood could have been drawn (Fable-26 #11); intoxication narrative via Perry. The Valero purchase contradiction is absent | Partial. The vape-pen point is a real cross-examination fact the engine did not surface |
| 9 | **Judge's casual voir dire conduct** — bailiff salary jokes | Nothing | Engine gap by design: no judicial-demeanor screen, and these Gary runs predate the voir_dire screen. Manual concedes it is not reversible |

## 4. Engine findings with no counterpart in the manual review (guilt phase)

- **Improper jury argument, preserved**: "He's got the same subpoena power we do" — objection, instruction requested, **mistrial moved**. Burden-shifting.
- **Venue / territorial jurisdiction**: motion for directed verdict denied; venue rested on the defendant's alleged statement and Sheikh's cell-site inference.
- **Cell-site testimony (canary)**: Sheikh conceded he is not a cell-site expert; State's Ex. 18 generated on "Batchego.com", a free consumer site; **preserved** 701/702 / Kelly objection; and on cross the mapped pings (9:21–9:35) contradicted the McDonald's video (9:15) — "That's not accurate."
- **903 recantation caller (canary)**: unidentified female alleging fabrication; number documented; no investigation.
- **Brady / lost evidence cluster**: trace from the underwear collected but never analysed; the vulvar swab box empty; SANE SDFI photographs "may or may not" travel with the chart; ~20 pages of raw AT&T data in the State's file; two AT&T packets the case agent had never seen; vehicle and phone never seized (Spring Valley PD ignored TCIC instructions); the "nana" never interviewed.
- **Likelihood ratio misstated as certainty**: "1 in 16.8 septillion … it's him. I mean that's the guy" in opening, against the lab's verbal-scale report.
- **Impeachment**: complainant's suicidal-ideation/cyberbullying explanation appearing for the first time at trial.

## 5. Ranking differences

| | Manual review | Engine |
|---|---|---|
| #1 | Confrontation (Ex. 33) | Sentencing: unauthorised fine (dispositive, both models) |
| #2 | Photo array due process | Double jeopardy, preserved (dispositive Opus / supportive Fable) |
| #3 | Mental health / Brady | Cumulation (dispositive Opus / background Fable, authorisation noted) |
| #4 | Hearsay predicate | Enhancement predicate — pen packet linkage |
| #5 | IAC (subpoena analyst; suppression motion) | Confrontation / cell-site / 903 caller (supportive) |

The engine's own models disagree on cumulation — Opus dispositive, Fable background with the statutory basis for stacking noted. That disagreement is exactly what the attorney ledger exists to adjudicate; the canary is phrased under double jeopardy, not cumulation.

## 6. Where the manual review is likely wrong, and where the engine is

**Manual review** (verifiable against the engine's verbatim quotes): witness conflation (Carmona as mother; Stutts as the nurse); "Sitka" for Patnaik; "no formal hearing / may be waived" where a remoteness objection was in fact lodged and overruled; Exhibits 33–37 treated as one block. These are the ordinary errors of a fast read of five volumes — and the reason a manual review cannot be adopted as ground truth without adjudication.

**Engine**: no identification-procedure analysis at all (photo array suggestiveness, blind administration); no relationship/vouching bolstering; no judicial-demeanor observation; the Valero vape-pen contradiction not surfaced; the manual's two IAC theories not considered. Severity on the Confrontation issue may be under-called relative to how an appellate lawyer would brief it.

## 7. What to do with this

1. **Ledger**: add candidate entries for the photo array / facial-recognition identification procedure and for relationship bolstering, marked *unadjudicated*; resolve the Carmona and Stutts identities against the RR before either side's version is trusted.
2. **Screens**: an identification-procedure screen (Biggers factors, array construction, administrator knowledge, facial-recognition seeding) is a genuine gap; add vouching/bolstering indicators to the preserved-error prompt. Both are small prompt changes gated by the eval harness (NFR-1).
3. **Report**: consider whether Part B should surface the sentence itself as context ("automatic life ×2, consecutive, $10,000 each") — a reader who stops at the verdict, as this review did, misses the strongest claims.
4. **Re-run the eval gate on Fable 5.1** before relying on any of the above as the production picture.
