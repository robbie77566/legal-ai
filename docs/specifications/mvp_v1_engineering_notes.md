# Engineering Review — MVP v1.0 Clarifications & Additions

**Status:** Draft for engineering review · **Owner:** Engineering · **Last updated:** 2026-08-29
**Companions:** `mvp_v1_prd.md` · `mvp_workflow_design.md` · `../design/mvp_ui_design_spec.md` · `internal_operations_spec.md` · `../architecture/cost_optimization_ollama.md` · **`../architecture/mvp_v1_system_design.md`** (the system architecture that implements these contracts — schema, services, queues, security model, build plan)

An expert engineering pass over the product docs against the actual stack (Next.js App Router, Fastify, BullMQ/Redis, Postgres+pgvector with RLS, Neo4j, S3, NextAuth). Items are numbered ENG-x; each names the doc it clarifies. These are contracts and decisions, not tasks — the roadmap sequences the work.

## ENG-1 · The case state machine (missing contract — highest priority)

The tracker names five customer-visible stages, but no doc defines the canonical machine. Contract:

```
DRAFT → AWAITING_DOCS → DOCS_COMPLETE → DIGITIZING → ANALYZING → ADJUDICATING → QA_REVIEW → QA_REJECTED ↩ (to ANALYZING or QA_REVIEW)
      → READY → DELIVERED  |  terminal: REFUNDED, DELETED
   holds (orthogonal flags, not states): OCR_HALT (E-1), DELAY_OURS (OPS-7), SUBSEQUENT_WRIT_MODE (E-7)
```

- Transitions are event-sourced (append-only `CaseEvent` rows) — the customer tracker, the Ops queue, and analytics all derive from the same event stream; no surface computes state independently.
- Customer-visible stage = a pure mapping from state+holds (e.g., `OCR_HALT` renders as "We need your help with some pages", `DELAY_OURS` renders the honest-delay message). The mapping table lives in code beside the enum and mirrors UI spec §5.6.
- `DOCS_COMPLETE` is written exactly once per run and stamps the SLA clock (US-3).

## ENG-2 · Findings & citation schema (the pipeline↔QA↔report contract)

FR-6/FR-7 (grounding as a hard filter, re-verification at render) require a stable schema:

```jsonc
Finding {
  id,                    // stable across re-runs: hash(category + primary citation) — enables US-6 diff
  category,              // preserved_error | iac | brady | junk_science | sentencing | deadline | appeal_restoration | new_evidence_flag
  severity,              // dispositive | supportive | background
  confidence,            // model-reported, calibrated per eval harness
  adjudication,          // agree | disagree | not_run  → disagree forces QA attention (US-8)
  s4_exception_tags[],   // subsequent-writ mode only (FR-9)
  citations[]: { docId, volume, page, line?, chunkId, excerptHash },
  partA_text, partB_text,
  provenance             // ai | ai_human_edited  → AI-disclosure labeling (best_practices)
}
```

- **`chunkId` + `excerptHash` are the re-verification anchors**: at report render, every citation re-fetches its chunk and compares hashes; mismatch drops the finding (FR-7) and alerts QA. Chunks are immutable per ingestion run.
- QA edits write `provenance: ai_human_edited` and are audit-logged; the report labels AI-generated vs. human-edited content per the AI-disclosure rule.
- Re-run (US-6) "what changed" = set-diff on `Finding.id` + severity/citation changes.

## ENG-3 · "Billable page" definition + deduplication (billing fairness)

The $299/5,000-page cap prices an undefined unit. Contract:
- **Billable page** = one normalized page image after ingestion (PDF page or one photo capture), counted post-processing, displayed live in the S3 page meter from the same counter that bills — one authority, no drift.
- **Dedup before counting:** per-page perceptual hash + per-file content hash; re-uploads, shoebox duplicates of checklist items, and overlapping volume uploads never count twice. Overage (+$49/2,500) applies to the deduped total and **any partial block rounds *down* in the customer's favor until the block is actually entered** (crossing page 5,001 starts one block; we never charge a block for pages not received).
- The meter shows the deduped number; a "duplicates ignored: N" note builds trust with shoebox users.

## ENG-4 · Upload hardening (missing functionality)

- **Formats:** accept HEIC/HEIF (the iPhone default — the phone-capture spec is broken without it) and convert server-side; PDF/TIFF/JPG/PNG per US-2; enforce per-file (500MB) and per-case size limits at presign time.
- **Multipart + resume:** S3 multipart for files >50MB; the TanStack retry queue (UI spec) pairs with server-side upload session records so an interrupted 300MB volume resumes, not restarts.
- **Malware scanning:** consumer-supplied files are scanned (e.g., ClamAV lambda/worker) between upload and ingestion; infected files quarantine with a plain-language customer message. Court-record CDs/USBs are a classic malware vector (the Spinks jail-call disc literally ships with `autorun.inf`).
- SSE progress endpoints are tenant-scoped and authenticated — progress events must never leak across cases.

## ENG-5 · Payments reliability

- Stripe webhook handling is **idempotent** (event id ledger) and paired with a **reconciliation job** (hourly: Stripe charges ↔ cases; mismatch pages ops — closes the "webhook loss" runbook loop with automation, SRE-4).
- Case creation on `payment_success` is transactional with tenant creation; a crash between charge and case must self-heal via reconciliation, never require support.
- Refunds (OPS-2) go through the same ledger; partial-refund amounts are computed from the billable-page counter (ENG-3), not hand-entered.

## ENG-6 · Batch-API asynchrony vs. the SLA

Tier-1/2 batch jobs can take up to 24h per provider terms. Stage design must be poll/callback-driven (BullMQ delayed jobs polling batch status), the SLA arithmetic in SRE-1 must budget batch worst-case, and the router needs a **standard-API fallback** rule: if a batch job exceeds its stage budget, re-submit non-batch and record the cost delta (the SRE-4 runbook's automated half).

## ENG-7 · Consumer identity & tenancy decisions

- **Role mapping (decision needed, flagged to auth spec):** the purchaser in their single-member tenant should be a new `CLIENT` role — granting consumer purchasers `ADMIN` (tenant settings, user management) or `ATTORNEY` (professional surfaces) misfits both the permission model and the analytics. Add `CLIENT` to the Role enum alongside the pending `VIEWER` fix.
- **Password reset is v1.0 launch scope**, not Phase 2: a family returning after three weeks of records-gathering *will* have forgotten the password, and the auth spec's reset flow is the only recovery path. Pull forward.
- **Anonymous S0 drafts** (W-1): server-side, keyed by opaque token, **30-day TTL then hard delete**, never used for marketing — S0 answers are sensitive facts about a real person. Promotion to a case copies then deletes the draft.

## ENG-8 · Report artifacts

- **Share-with-a-lawyer link** (US-4/US-5): a time-limited signed URL (default 30 days, re-issuable, revocable from the case page) to a read-only Part B; no attorney account required at v1.0. Access is logged (the family can see "your lawyer opened it" — trust signal and nudge).
- **Record-peek stability:** cited page images are pre-rendered at QA approval (not fetched live from source PDFs) so report links render exactly what QA verified, forever.
- **PDF versioning:** every delivered report stores its template version + findings snapshot (SRE-5); re-runs produce new versions, never overwrite. Part A PDFs are tagged (accessible) PDFs; locale-aware templates from day one (NFR-2).

## ENG-9 · Calendars, clocks, and cost threading

- One **business-day calendar service** (America/Chicago, US federal + Texas state holidays) backs both the SLA promise and the FR-5 deadline engine — two calendars would eventually disagree in public.
- **Cost telemetry** (NFR-4) requires every model/OCR call to carry `caseId` metadata end-to-end, including inside batch submissions; per-case COGS is a query, not an estimate.
- Email is the product's spine: SPF/DKIM/DMARC on the sending domain, and **bounce/complaint webhooks route to the Ops queue** — a bounced report-ready email is a delivery failure (state stays `READY`, not `DELIVERED`), never silence.

## ENG-10 · Reference case files don't belong in the repo (privacy/hygiene)

`Test Case Files/` holds real records with real names (Gary, Brian Spinks) — 2GB+ including jail-call audio and interview video. These are the eval corpus, but a git repo (even private, even untracked-but-present) is the wrong home: cloning developers shouldn't carry them, and history must never contain them.
- Move to encrypted private object storage (the eval harness reads from a configured bucket); keep only a manifest (checksums + provenance + consent basis) in the repo.
- Add `Test Case Files/` to `.gitignore` immediately so they can't be committed by accident.
- `model_evaluation.md` ledgers reference the manifest, not paths in the working tree.

## ENG-11 · Smaller clarity fixes folded into owning docs

- Page-meter copy shows the deduped count (ENG-3) — UI spec §5.5.
- `docs.stalled_7d` fires from the event stream (ENG-1), not a cron scanning tables — analytics plan §2.
- QA console "approve" writes the findings snapshot + template version that READY will render (ENG-8) — PRD US-8.
- Analytics cookie (experiment assignment) is first-party, strictly necessary-adjacent; disclosed in the privacy policy; no consent banner needed for first-party-only, but counsel confirms under TDPSA — landing spec §5.
