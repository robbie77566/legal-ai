# Automated QA Pass, Holds, and the 24-Hour Review Workflow

**Prepared:** 2026-09-01 · **Status:** implemented with this document · **Builds on:** auto-delivery (`auto-qa.service`, runbook §Auto-delivery) — this spec adds what happens when the automated pass FAILS: the customer promise, and the admin's triage workflow.

## 1. Requirements (PM)

- **R1** Every completed analysis run passes through the automated QA gates (already live): all screens completed, minimum findings, grounding drop-ratio bound, FR-7 verification. Pass → auto-deliver (existing).
- **R2 (new)** On a gate failure ("hold"), the customer is told the truth without alarm, **once per hold episode**: their review reached an extra quality step, a specialist is reviewing it personally, and the report is expected **within 24 hours** — by email and on the tracker.
- **R3 (new)** The admin has a dedicated **hold queue**: every held case with its machine-readable failure reasons, how long it's been held, and time remaining against the 24-hour promise, ordered most-urgent first.
- **R4 (new)** Each failure reason maps to a documented **playbook** (jobs to do + corrective action), and the primary corrective action — re-run the analysis — is one click from the queue.
- **R5** Resolution flows through the *existing* human paths (approve / edit-then-approve / reject-rerun), so the audit story stays single: every delivered report was approved by `auto_qa` or a named human, never a third thing.
- **R6** An operator who ignores the queue must get paged: holds emit a stable log signature for the Sentry/log alert rule (runbook P0-10 family).

## 2. Admin workflow research → the triage model

Human-in-the-loop review ops (support-queue and content-moderation practice) converge on four rules, all adopted: **(a)** triage strictly by SLA-remaining, not arrival order; **(b)** the failure *reason* — not the case — decides the playbook, so the queue leads with reason chips; **(c)** the common fix must be one click (re-run covers most transient failures); **(d)** every resolution is recorded so gate thresholds can be tuned from data rather than vibes (resolutions land in the audit log via the existing approve/reject actions).

### Jobs to do & playbooks, per failure reason

| Reason chip | Likely cause | Jobs to do | Corrective action |
|---|---|---|---|
| `screens N/5` | Transient: batch item error, content-filter rejection, crash mid-run | Skim api log for the run (`[analysis]`/`[auto-qa]` lines) | **Re-run** (one click). Second identical failure → open the case, check the record for filter-triggering content; escalate to engineering |
| `findings 0` | Engine failure far more often than a genuinely clean record | Open the case in QA; sanity-check chunks exist and the record digitized | **Re-run**; if it persists AND the record is real, approve the neutral nothing-found report deliberately (human judgment, existing approve) |
| `drop ratio > 0.5` | Prompt/grounding drift, or a formatting-hostile record | Open QA console; review what DID ground; compare to the eval canaries | **Re-run** once (variance); repeated → run `eval-run.ts`, treat as engine regression, engineering item |
| FR-7 / exception holds | Data integrity or code fault | Read the `[auto-qa]` error line | Engineering escalation — never force-approve past FR-7 |

**SLA discipline:** the 24-hour clock starts at hold time and is displayed as a countdown; anything under 6 hours remaining sorts red-first. A re-run that passes the gates auto-delivers and emails the customer with no further admin work — the loop closes itself.

## 3. UX design

**Customer (family under stress — reassure, never alarm):**
- *Email at hold* (once per episode): subject "A specialist is giving your review a closer look" — body: the automated quality check flagged something we want a person to verify; nothing is wrong with your case; expect your report **within 24 hours**; link to the tracker. No jargon, no failure language.
- *Tracker*: the `quality_review` stage line becomes: "A trained legal reviewer is personally checking your report — expect it within 24 hours." (With auto-delivery on, *any* case a customer sees in this stage IS a held case — the happy path passes through it in seconds — so the copy is honest without needing hold-state plumbing to the client.)
- *Resolution*: the existing report-ready email; no "it was held" postmortem — the customer's story is "extra care," start to finish.

**Admin (the internal persona — speed and certainty):**
- QA console gains a **"Held by automated QA"** section *above* the normal queue: per row — case title, reason chips, held-for duration, **SLA countdown** (red under 6h), playbook hint for the top reason, and two actions: **Re-run analysis** (one click, optimistic) and **Open** (existing case detail for approve/edit/reject).
- Row disappears when resolved (status leaves QA_REVIEW or a newer run passes).

## 4. Engineering interrogation (holes closed before code)

1. **Email storm on repeated holds**: a re-run that fails again must not re-email — the hold email sends only if no prior `auto_hold` audit row exists for the case (episode = case-level, reset implicitly on delivery).
2. **Client hold-detection**: rejected extra API surface; the copy trick in §3 (auto-delivery makes `quality_review` synonymous with held) keeps the tracker contract unchanged.
3. **Re-run endpoint semantics**: reuses the exact QA-reject(quality)→re-enqueue loop scripts use — one code path for re-runs everywhere; idempotent job id; 409 on non-QA_REVIEW cases.
4. **24h promise vs. the 10-business-day SLA**: the 24h is incremental customer copy, not a new stored SLA; `expectedReadyAt` is untouched. If holds ever routinely bust 24h, that's an ops fact the queue makes visible — fix the ops, not the copy.
5. **Who watches the watcher**: `[auto-qa] … HELD` is the stable log signature; runbook alert list gains it (log-based alert → founder's phone).
6. **Tracker copy test drift**: the existing unit test pins the reviewer-role copy; updated in the same change.

## 5. Acceptance (implemented + tested)

Hold → customer email once (capture-provider test proves single-send across two holds) + `snl.qa_hold` event; `GET /qa/holds` lists reasons/heldAt/slaRemaining ordered ascending; `POST /qa/cases/:id/rerun` transitions QA_REVIEW→QA_REJECTED→ANALYZING and enqueues (409 otherwise); tracker copy carries the 24-hour expectation; QA console renders the hold section with countdown and one-click re-run.
