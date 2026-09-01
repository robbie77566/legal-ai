# Manual Test Fixtures

Small, fully **synthetic** files for manual end-to-end testing of the upload →
digitize → classify → checklist flow. Every document names the fictional
defendant "JOHN FIXTURE" and is watermarked `SYNTHETIC TEST DOCUMENT` — no real
person, case, or court record. (The real reference corpora — Gary/Brian — are
sensitive and live ONLY in the encrypted S3 eval bucket, never in git.)

| File | What it exercises |
|---|---|
| `judgment.pdf` | Born-digital parse + classifier files it as **judgment** (high confidence → checked off silently, no quick-check card) |
| `indictment.pdf` | Classifier → **indictment** |
| `reporters-record-vol1.pdf` | Classifier → **rr_volume** |
| `plea-papers.pdf` | Classifier → **plea_papers** (plea-lane checklist) |
| `notes.txt` | Unsupported type — inside the ZIP it must be **skipped and reported** ("we can only read PDFs and photos") |
| `court-papers.zip` | The bulk path: 4 PDFs accepted, `notes.txt` skipped as unsupported, `__MACOSX` junk pruned; checklist items flip live as entries classify |

## Using them in a manual test

1. Sign in as a CLIENT with a case in `AWAITING_DOCS` (README → How to test →
   Manual end-to-end walkthroughs).
2. On the case documents page, drop `court-papers.zip` on the add zone —
   expect: unpack summary "4 documents added, 1 file skipped", checklist items
   checking off within ~30s, per-file "Reading it now… → ✓ Recognized" chips.
3. Or upload any single PDF to test the one-file path.

## Regenerating

`python3 test-fixtures/make_fixtures.py` rewrites everything in place. The
PDFs are handwritten-minimal (one page, Helvetica) — verified to parse through
the pipeline's own pdf-parse path. If you edit the text, keep the phrases the
classifier keys on (JUDGMENT, GRAND JURY, REPORTER'S RECORD, WAIVER OF JURY)
and the SYNTHETIC watermark.
