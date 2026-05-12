# Criminal Case Lifecycle & HabeasGraph Strategy

This document maps the full lifecycle of a criminal case, focusing heavily on Texas procedures. For each stage, it defines the procedural aspects, the legal deliverables required, and the strategic solution **HabeasGraph** provides via its multi-agent architecture and third-party integrations.

---

## 1. Stage 1: Pre-Trial & Trial
While HabeasGraph is built for post-conviction, early ingestion of trial data prevents later bottlenecks.
*   **Procedural Aspect:** Discovery exchange, grand jury indictment, pre-trial motions, jury selection (voir dire), trial, and verdict.
*   **Deliverables:** 
    *   Discovery Index (logs of evidence).
    *   Motions to Suppress Evidence.
    *   Witness Examination Outlines.
    *   Jury Instructions.
*   **HabeasGraph Solution:** 
    *   **The Ingestion Engine:** Automates the transcription and indexing of massive multimedia discovery (e.g., bodycam footage, jail calls) into the `pgvector` database, allowing defense teams to instantly search audio transcripts for conflicting statements before trial.
    *   **Motion Generator:** Uses LangGraph to cross-reference police reports against constitutional case law to draft preliminary Motions to Suppress.

## 2. Stage 2: Direct Appeal
A direct appeal challenges legal errors that occurred *on the record* during the trial. No new evidence is allowed.
*   **Procedural Aspect:** Filing notice, preparing the appellate record, briefing, and oral arguments before the intermediate Court of Appeals.
*   **Deliverables:**
    *   Notice of Appeal (due 30 days after sentencing).
    *   Appellant’s Brief (containing the Statement of Facts and arguments).
    *   Petition for Discretionary Review (PDR) to the Texas Court of Criminal Appeals.
*   **HabeasGraph Solution:**
    *   **Preserved Error Extraction:** An agent reads the entire trial transcript in "Parchment Mode" and automatically flags all instances where the defense counsel said "Objection," mapping whether the judge sustained or overruled it. This provides the appellate attorney an instant roadmap of legally viable, "preserved" appellate claims.
    *   **Automated Statement of Facts:** Synthesizes the chronological events from the transcript into a coherent, citation-backed narrative for the Appellant's Brief.

## 3. Stage 3: State Habeas Corpus (Article 11.07 / 11.072)
This is the core of HabeasGraph. A writ of habeas corpus challenges confinement based on issues *outside* the trial record (e.g., ineffective counsel, new scientific evidence, *Brady* violations).
*   **Procedural Aspect:** Filed in the convicting trial court. The state files an answer. The trial judge may hold evidentiary hearings and issues "Findings of Fact and Conclusions of Law," which are forwarded to the Texas Court of Criminal Appeals.
*   **Deliverables:**
    *   Application for Writ of Habeas Corpus (using the mandatory state form).
    *   Mitigation Packet (Life history, medical records).
    *   Affidavits (from witnesses, experts, or previous trial counsel).
    *   Proposed Findings of Fact and Conclusions of Law.
*   **HabeasGraph Solution:**
    *   **The Mitigation Graph:** The Mitigation Specialist uses the Neo4j Force-Directed Graph to map decades of unindexed medical, school, and prison records. The graph visualizes hidden connections (e.g., linking a juvenile disciplinary record to an undiagnosed brain injury).
    *   **Master Sheet Export:** LangGraph directly populates the strictly formatted `.docx` Master Sheets required by Texas courts, perfectly citing the extra-record evidence.

## 4. Stage 4: Federal Habeas Corpus (28 U.S.C. § 2254)
If state remedies are exhausted and denied, the defense can petition the federal courts, subject to strict AEDPA deadlines.
*   **Procedural Aspect:** Challenging the state conviction on federal constitutional grounds.
*   **Deliverables:**
    *   Federal Petition for Writ of Habeas Corpus.
    *   Memorandum of Law demonstrating that state remedies were properly "exhausted."
*   **HabeasGraph Solution:**
    *   **Exhaustion Tracker:** A specialized LangGraph agent verifies that every constitutional claim being drafted in the federal petition was explicitly raised and denied during the Article 11.07 state proceedings, preventing the federal petition from being dismissed on procedural grounds.

## 5. Stage 5: Clemency & Parole
Administrative requests for mercy or early release from the executive branch.
*   **Procedural Aspect:** Applications to the Texas Board of Pardons and Paroles.
*   **Deliverables:**
    *   Clemency / Commutation Petition.
    *   Parole Packet (Support letters, rehabilitation certificates, re-entry plans).
*   **HabeasGraph Solution:**
    *   **Rehabilitation Narrative Builder:** Analyzes prison disciplinary records, educational certificates, and support letters to draft a compelling narrative of rehabilitation and low recidivism risk.

---

## 6. Proposed Ecosystem Integrations

To ensure HabeasGraph becomes a frictionless part of the legal workflow, it must integrate with the existing tools law firms already use.

*   **Practice Management (Clio / MyCase APIs):**
    *   *Purpose:* Syncing client metadata, statute of limitation deadlines (critical for AEDPA), and case status directly into the HabeasGraph Bento Dashboard.
*   **Evidence Management (Axon / Evidence.com APIs):**
    *   *Purpose:* Direct pipeline to ingest raw bodycam, dashcam, and jail call audio/video files.
*   **Public Records & Court Dockets (PACER / RECAP / Texas eFile):**
    *   *Purpose:* Monitoring federal and state dockets to automatically ingest opposing counsel's filings (e.g., the State's Answer to an 11.07 writ) to immediately begin generating counter-arguments.

---

## 7. Required Model Context Protocol (MCP) Agents

To execute this lifecycle strategy securely and effectively, HabeasGraph requires the development of several specialized MCP servers to extend the reasoning capabilities of its LLMs.

1.  **`mcp-clio-sync`**
    *   **Function:** Connects HabeasGraph to the firm's Clio database via OAuth2.
    *   **Capabilities:** Pull client metadata, read/write case deadlines, and track billable hours associated with AI generation time.
2.  **`mcp-tx-cca-caselaw`**
    *   **Function:** A highly specialized Retrieval-Augmented Generation (RAG) server querying a curated, daily-updated vector store of Texas Court of Criminal Appeals (CCA) opinions.
    *   **Capabilities:** Prevents hallucinations by forcing the LLM to ground its legal arguments *only* in verified Texas precedent, ignoring generic federal or out-of-state law.
3.  **`mcp-axon-transcriber`**
    *   **Function:** Handles heavy multimedia processing.
    *   **Capabilities:** Interfaces with Whisper (or similar local models) to transcribe huge audio/video files from discovery, passing the timestamped text back to `pgvector` for indexing.
4.  **`mcp-bluebook-sanitizer`**
    *   **Function:** Formatting compliance.
    *   **Capabilities:** A rules-based (non-LLM) or strictly prompted agent that reviews all generated outputs to ensure citations conform perfectly to *The Bluebook: A Uniform System of Citation* and Texas Rules of Appellate Procedure (TRAP) formatting requirements.
