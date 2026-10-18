# TRAP clock and counsel vehicles (`@hg/case-lifecycle/trap`)

Workstream E of the persona rollout plan, January slice: the engine and data behind the counsel packet's deadline-posture block, §4 framing, §2254 map and *Anders* appendix. Rendering lives in `packages/reports` (a later slice); routes, web and the matter form are out of scope here.

| File | What it holds |
| --- | --- |
| `vehicles.ts` | The seven vehicles (`direct_appeal`, `pdr_clock`, `11.07`, `11.071`, `11.072`, `11.09`, `2254`), their court, filer, weighted screens, and the refusal gate (`vehicleAcceptance`: 11.071 refused outright; capital refused on every vehicle). |
| `trap-chain.ts` | The vector table: TRAP 21.4, 26.2, 26.3, 35.2, 38.6, 48.4, 49.1, 68.2 (direct-appeal chain) and Art. 11.07 §3(b)/(c), TRAP 73.4, 73.5 (11.07 chain), each labelled jurisdictional or discretionary. `unsignedVectors()` lists what nobody has signed. |
| `rule-4-1.ts` | TRAP 4.1(a) counting and roll-forward with the 2026–2027 Texas legal-holiday table and its documented limitations. |
| `clock.ts` | `computeTrapClock(inputs)`: ordered steps with due date, basis, status (`done` / `open` / `missed` / `not_yet`), `nextDue`, `missedJurisdictional`, `unsignedCount`. |
| `posture-11-07.ts` | `posture1107(...)`: the §4 subsequent-writ flag, one-shot and complete-inventory framing, premature-filing and no-rehearing notes, as data with copy keys. |
| `exhaustion-2254.ts` | `exhaustionMap(...)`: per-ground `exhausted` / `unexhausted` / `procedurally_defaulted` under a six-line rule, plus the AEDPA year delegated to `computeDeadlinePosture` (never recomputed). |
| `anders.ts` | `ANDERS_CHECKLIST`: the items an *Anders* brief and its *Kelly* duties must address, each with a source and the screen ids whose findings the report maps onto it. |

## Signed versus proposed

Every vector, holiday-table entry, checklist item and posture rule in this directory is `confidence: 'proposed'` today. The plan's acceptance for this workstream is "TRAP vectors counsel-signed", and signing is a human step: the engine cannot sign its own rules. Until a vector is signed the packet must print the unsigned disclaimer (`unsignedVectors()`, `TrapClock.unsignedCount`, `unsignedAndersItems()`), and every clock already carries `disclaimerKey: 'deadline.verify_with_attorney'`.

Where the rule text as recalled here was uncertain, the vector's `note` says so (for example which of TRAP 73.4(b)(5) and 73.5 carries the 180-day sentence, the 49.8 and 68.2(c) subdivision letters, the *Kelly* ten-day figure). Those notes are the signer's worklist.

## Sign-off procedure

1. A Texas appellate lawyer reads each vector against the current Texas Rules of Appellate Procedure (the February 2026 text the persona doc links) and the Code of Criminal Procedure, checks the trigger, the day count, the extension mechanism and the jurisdictional label, and corrects anything wrong in the same change.
2. For each vector they are satisfied with, they set `confidence: 'signed'` and `signedBy: '<name, bar number>'` in `trap-chain.ts` (and likewise in `rule-4-1.ts` for the holiday table and `anders.ts` for checklist items). Nothing else in the row changes without a note.
3. The change is merged by the founder (founder-merged, like the FR-5 vectors in `tests/deadline-vectors.json`). The tests in `tests/trap.*.test.ts` pin the literal dates, so a signed vector that later drifts fails CI.
4. `unsignedVectors()` shrinks as rows are signed; the packet drops the disclaimer only when it returns an empty list.

Re-sign after any TRAP amendment that touches a listed rule; the vector's `note` should then cite the order.

## Limitations to keep in view

- Legal holidays come from Tex. Gov't Code §662.003 for 2026–2027 only. Observed federal days, court closure orders and TRAP 4.1(b) (clerk's office inaccessible) are not modelled; outside the table only weekends roll and the clock says so in `notes`.
- Accelerated appeals (20-day brief), State's appeals (26.2(b)), the 11.072 and 11.09 timetables, and 11.071 are not modelled; the clock returns no steps for those vehicles and explains why.
- The exhaustion map does not decide cause-and-prejudice, *Martinez*/*Trevino*, or actual-innocence gateways.
