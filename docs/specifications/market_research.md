# Market Research: HabeasGraph

## Overview
The legal AI market has shifted from general research tools to specialized "vertical" agents. For the **HabeasGraph** project, the most relevant competitors and inspirations are tools that focus on transcript interrogation, citation integrity, and procedural automation.

## Key Competitors & Inspiration

### 1. CaseMark (The Procedural Specialist)
*   **Focus:** Habeas Corpus drafting (28 U.S.C. § 2254/2255).
*   **Key Feature:** Automates "Exhaustion Analysis" – ensuring all claims were presented to the state's highest court before moving to federal court.
*   **Relevance:** We should adopt a similar procedural checklist for **Texas Article 11.07** writs.

### 2. Clearbrief (The Citation Specialist)
*   **Focus:** Linking legal briefs to the evidentiary record.
*   **Key Feature:** "Side-by-side" view where clicking a citation in a motion immediately pulls up the exact page/line in the trial transcript.
*   **Relevance:** Essential for proving **Ineffective Assistance of Counsel (IAC)**. Our platform must prioritize this "Proof-to-Source" link.

### 3. Transcript Genius by Steno (The Interrogator)
*   **Focus:** Cross-transcript querying.
*   **Key Feature:** Allows users to ask natural language questions across multiple depositions or trial days (e.g., "What were the inconsistencies in witness Smith's testimony regarding the weapon?").
*   **Relevance:** High-volume document interrogation is the primary value prop for an 11.07 specialist.

### 4. JusticeText (The Evidence Specialist)
*   **Focus:** Public Defenders and Discovery.
*   **Key Feature:** Analyzes audio/video (Bodycam, Jail Calls) alongside text.
*   **Relevance:** Many Texas post-conviction cases rely on jail call records or undisclosed bodycam footage.

## Market Gaps
*   **State-Specific Depth:** Most tools are "Federal-First." There is a gap for a tool that "lives and breathes" the **Texas Court of Criminal Appeals (CCA)** rules and local county practices (e.g., Harris vs. Dallas County procedural quirks).
*   **MCP Integration:** No current tool leverages the **Model Context Protocol** to allow users to plug in their own specialized legal "knowledge servers."

---

## Update (Aug 2026): Deep competitive study

A full study of the five dominant platforms serving Texas post-conviction practice — **Westlaw Precision + CoCounsel, Lexis+ AI/Protégé, vLex Fastcase/Vincent, Everlaw (+ Everlaw for Good), and Casefleet** — including feature matrices, personas, JTBD, pain points, verified/reported pricing, and licensing models lives at `docs/business_case/snotnoselegal_market_study_mvp_gtm.pdf` (.docx alongside). Key conclusions that supersede the notes above where they conflict:

*   **The competitive floor in Texas is free.** vLex Fastcase is free to every State Bar of Texas member (statewide bar site license); Everlaw for Good gives innocence projects and CJA panel attorneys ediscovery at $0. Positioning must never sound like "research" or "document review."
*   **The white space is the habeas spine:** 11.07/AEDPA deadline & tolling computation, exhaustion tracking, IAC affidavit workflow, intake triage/viability scoring, 11.073 junk-science screening, clemency packets, a knowledge-graph record view, on-prem deployment, and any consumer/family-facing product — absent from all five platforms.
*   **Four personas, one contested:** only the appellate attorney is (partially) served by incumbents; the mitigation specialist, clinic director, and the inmate's family are unserved. The family is the MVP v1.0 wedge — see `mvp_v1_prd.md` and `product_roadmap.md`.
*   **Price anchors:** Casefleet $30–$140/seat/mo (published) below; quote-only enterprise ($639+/seat/mo verified for Westlaw+CoCounsel) above; the ~$3,000 attorney document-review fee is the consumer anchor.
