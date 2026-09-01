# Data Retention Tiering & the Reuse Question

**Prepared:** 2026-09-01 (PM research) · **Governing commitments (unchanged by this doc):** 12-month retention then deletion, stated at purchase (NFR-3); deletion on verified request; backups ≤35 days (§11a.2); **"never used to train AI" — published in the FAQ, the privacy policy, and the buy-flow disclosures.**

## 1. Industry-typical holding periods (research summary)

Consumer document services converge on a three-phase lifecycle: **hot** while the customer actively needs instant access (active case + dispute window), **warm/cool** for the remaining committed retention (rare access, cheaper storage, still quick retrieval), then **deletion or archive** per the stated policy. The concrete anchors for us:

- **Chargeback window**: card networks allow disputes ~120 days from charge — documents and the E-6 evidence packet must stay friction-free for ~4–6 months.
- **Re-run product (US-6)**: customers can buy a $99 re-run any time before deletion — so nothing may sit in storage classes with hours-long thaw (rules out Glacier Deep Archive inside the 12 months).
- **Our own deletion promise caps the tail**: 12 months, then gone. There is no "long-term storage" phase for customer data — the long term is *deletion*.

## 2. Recommended lifecycle (and the honest cost math)

| Phase | Age | Class | Why |
|---|---|---|---|
| Hot | 0–90 days | S3 Standard | active pipeline, disputes, early re-runs |
| Cool | 90 days–12 months | S3 Standard-IA (or Glacier Instant Retrieval) | millisecond retrieval preserved for re-runs/downloads at ~½–⅙ the storage price |
| End | 12 months | **Deletion** (existing OPS retention workflow) | the promise |

**Scale honesty:** at base-case volume (~30 cases/mo, ~0.5GB average) steady-state storage is ~180GB/year → S3 Standard ≈ **$4/month**; full tiering saves ≈ **$3/month**. This is hygiene, not economics — worth one lifecycle rule, worth zero engineering beyond it. Revisit if volume 10×s.

## 3. Reuse for testing/training — the commitment collision (flagged, not skipped)

The founder's instinct to reuse aged cases for testing/training collides with a **published promise**: *"never used to train AI"* appears in the FAQ, the privacy policy, and the acknowledged disclosures. Quietly repurposing customer records would breach it regardless of intent. Compliant paths, in order of recommendation:

1. **Consent-based research program (recommended, v1.1 with counsel):** an explicit, default-OFF, revocable opt-in — same architecture as the existing US-5 ConsentGrant — offered post-delivery ("help improve reviews for other families"), possibly incentivized (e.g., discounted re-run). Consented cases copy into the eval corpus bucket under a distinct prefix with the consent record attached; revocation deletes the copy. Policy copy updated *by counsel* to describe the program precisely.
2. **The eval-corpus route (available today):** reference records acquired with permission (Gary, Brian) are already the testing backbone — growing that corpus by donation/licensing needs no policy change.
3. **What "public record" does NOT license:** the underlying court documents may be public, but the customer's uploads, association, and account are private; the published promise governs. No de-identification argument overrides an explicit "never."

**Testing ≠ training distinction worth preserving in any future copy:** regression *testing* against consented records (deterministic replay, eval ledgers) is operationally different from *training* models on them — but today's promise covers both in spirit; only counsel-reviewed copy should draw a finer line.

## 4. Actions

- Lifecycle rule (Standard→Standard-IA at 90 days, current versions) applied to the documents bucket — implemented alongside this doc.
- Deletion at 12 months: already the OPS retention workflow (`/ops/retention-candidates`, deliberate per-case OPS-4).
- Consent program: parked for v1.1 with the counsel-review batch (deadline vectors, disclosures rewrite).
