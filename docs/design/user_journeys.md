# HabeasGraph: User Journeys & UX Workflows

This document defines the core user personas, their specific pain points, the "Jobs To Be Done" (JTBD), and the step-by-step UX workflows for the **HabeasGraph** platform. These journeys are specifically designed to leverage the visual identity defined in `ui_design_system.md` (e.g., "Industrial Authority," "Parchment Mode," and the "Knowledge Graph").

---

## 1. User Personas & Pain Points

HabeasGraph is designed for the high-stakes, data-dense environment of Texas Post-Conviction Relief. We have identified three distinct user personas, ensuring we capture the entire case lifecycle from intake to final filing, directly avoiding the "Attorney-Only" trap of incumbent AI tools.

### Persona 1: The Lead Appellate Attorney
*   **Role:** Final decision-maker on legal strategy. Drafts the Article 11.07 writ, direct appeals, and clemency petitions.
*   **Pain Points:**
    *   Losing the factual "thread" of a claim across massive, disorganized boxes of paper trial records.
    *   The cognitive load of manually verifying every citation back to the original source text.
*   **JTBD:** *"When I am drafting an Article 11.07 writ, I want to pull exact, verified citations from the original transcript without breaking my drafting flow, so I can ensure the court trusts my constitutional claims."*

### Persona 2: The Mitigation Specialist / Post-Conviction Investigator
*   **Role:** The "fact-finder." Responsible for mapping the client’s entire life history, uncovering hidden trauma or systemic failures, and building relationships with witnesses.
*   **Pain Points:** 
    *   Data overload. They receive massive, unindexed dumps of medical, school, juvenile, and prison records spanning decades.
    *   Manually building chronological timelines from hundreds of disparate PDFs.
*   **JTBD:** *"When I receive a massive dump of institutional records, I want to automatically map every event into a visual chronological timeline, so I can uncover hidden mitigation factors (e.g., an undiagnosed traumatic brain injury at age 12) without reading every page linearly."*
*   **Strategic Note:** Competitors (Harvey, CoCounsel) completely ignore this persona. This is HabeasGraph's primary wedge into defense teams.

### Persona 3: The Clinic Director / Managing Public Defender
*   **Role:** Resource allocator. Manages the caseload for an innocence project or public defender clinic.
*   **Pain Points:** 
    *   Backlogs of hundreds of letters from inmates requesting representation.
    *   Inability to quickly triage which cases have actual, legally cognizable paths to release under Texas law.
*   **JTBD:** *"When we ingest a new batch of 50 inmate requests and raw dockets, I want a high-level summary of legal viability, so I can allocate my limited attorney and investigator hours to the cases with the highest probability of success."*

### Persona 4: The Inmate's Family Member (MVP v1.0 primary persona)
*   **Role:** The actual payer in retained post-conviction work. Not a lawyer; making a high-stakes cost-versus-probable-outcome decision under emotional stress; may not be a native English reader.
*   **Pain Points:**
    *   ~$3,000 buys only an attorney's *review* of the court documents — a go/no-go signal with no transparency; full representation runs $15k–$50k+.
    *   The alternative is pro se filing from a TDCJ unit, where a weak application burns the effective one shot allowed by Texas's subsequent-writ bar.
    *   No product on the market will even sell to them: every incumbent licenses to legal professionals.
*   **JTBD:** *"When my son's direct appeal is denied, I want to know whether a writ has any realistic chance before I spend $3,000 just for a lawyer to read the file, so I don't drain the family's savings on false hope."*
*   **Strategic Note:** This persona is the MVP v1.0 wedge (see `docs/specifications/mvp_v1_prd.md`) and the intake funnel for Persona 3: a consented high-viability review arrives at a clinic as a pre-triaged packet instead of a handwritten letter.

---

## 2. Core UX Workflows

The following workflows illustrate how these personas interact with the HabeasGraph interface to accomplish their JTBD.

### Workflow A: Triage & Intake (The Bento Dashboard)
**Primary User:** The Clinic Director
1.  **Ingestion:** The user drags and drops a massive zip file containing the raw docket, trial transcripts, and inmate correspondence into the upload zone.
2.  **Processing:** The system begins chunking the PDFs via `pgvector` and extracting entities into `Neo4j`. The UI displays the **"Listening Pulse"** (a soft Law Gold `#D4AF37` box-shadow pulse) around the ingestion module, signaling active LangGraph multi-agent reasoning.
3.  **Triage Dashboard:** The user is presented with a high-density, "Bento-style" grid (on a Surface `#161B22` background). Modules include:
    *   **Case Summary:** A 3-sentence extraction of the charges and sentence.
    *   **Viability Scorecard:** Red/Amber/Green semantic indicators (`#3FB950`, `#D29922`, `#F85149`) highlighting potential paths to release (e.g., "Potential Ineffective Assistance of Counsel flagged").
    *   **Actionable Triage:** The Director assigns the case to an Investigator.

### Workflow B: Chronological Discovery (The Knowledge Graph)
**Primary User:** The Mitigation Specialist / Investigator
1.  **Entity Resolution:** The Investigator opens the case. The system has automatically mapped people, dates, and locations. 
2.  **Visual Timeline:** The user navigates to the **Force-Directed Knowledge Graph**. Nodes (12px squircles) represent witnesses and events. 
3.  **Exploration:** The Investigator hovers over a node labeled "Medical Incident 1998". The UI highlights all connected edges in **Law Gold**, linking that incident to a specific school record and a subsequent disciplinary hearing.
4.  **Discovery:** By visually scanning the graph rather than reading thousands of pages chronologically, the Investigator quickly spots a pattern of unaddressed neurological trauma, tagging it as a critical mitigation factor for the Attorney.

### Workflow C: Deep Work & Drafting (The Side-by-Side Workspace)
**Primary User:** The Lead Appellate Attorney
1.  **Contextual Review:** The Attorney enters "Deep Work" mode to begin drafting the writ based on the Investigator's findings.
2.  **Side-by-Side Interface:**
    *   **Left Pane (The Source):** Displays the original scanned trial transcript in **Parchment Mode** (Background `#FDF6E3`, Text `#586E75`), mimicking the physical feel of a legal document.
    *   **Right Pane (The Intelligence):** Rendered in dark mode (`#0B0E14`). It displays the LangGraph Chat and the structured legal claims mapped by the Investigator.
3.  **Interactive Drafting:** The Attorney highlights a questionable piece of testimony in the left pane. The system instantly runs a Bluebook sanitization check and generates a formatted citation in the right pane, anchoring the claim directly to the source evidence.
4.  **Export:** The verified claims and citations are exported directly into the `.docx` Master Sheets required by the Texas Court of Criminal Appeals.

### Workflow D: Ecosystem Integration (OAuth Sync)
**Primary User:** The Clinic Director / Managing Public Defender
1.  **Configuration:** The Director navigates to the "Integrations" panel and clicks "Connect Clio" (or MyCase).
2.  **OAuth Flow:** The user is securely redirected to authorize HabeasGraph to read/write case data.
3.  **Data Population:** The `mcp-clio-sync` agent silently runs in the background, populating the Bento Dashboard with upcoming AEDPA deadlines and pulling in raw client metadata, eliminating dual data-entry for the entire team.

### Workflow E: Family Case Review (MVP v1.0)
**Primary User:** The Inmate's Family Member
1.  **Purchase:** The user pays a flat $299 via Stripe Checkout. Price, the 5,000-page cap, the refund policy, and the "information, not legal advice" statement are shown *before* payment. Account creation is email/password only — no tenant setup, no roles.
2.  **Guided Upload:** A plain-English wizard explains what to upload (judgment & sentence, clerk's record, reporter's record volumes, motions) with examples. PDFs/scans accepted; audio/video rejected with a friendly note about the future add-on. A running page counter shows usage against the cap.
3.  **Waiting:** A status page tracks Received → Reading the record → Analyzing → Quality review → Ready, with an email at each transition. No chat, no graph, no workspace — the multi-agent pipeline and knowledge graph run entirely behind the curtain.
4.  **Internal QA Gate:** Before release, a trained reviewer approves the report in the internal console (the side-by-side workspace, repurposed for staff). Nothing reaches the customer unreviewed.
5.  **The Report:** A two-part PDF. Part A speaks to the family at an 8th-grade reading level: what we reviewed, what we found, what it means, what to do next (always "consult counsel," never "file this"). Part B is the attorney-ready packet: every finding with volume/page/line citations and source excerpts.
6.  **Consented Referral:** If the review shows strong signals, the user may opt in to share the packet with an innocence clinic or take a vetted-attorney list. Default is private; nothing is shared without the explicit opt-in.
