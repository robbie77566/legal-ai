# HabeasGraph: Expanded Scope - The Incarceration Reduction Engine

Based on extensive procedural research, HabeasGraph is expanding its mission from a "Writ Specialist" to a comprehensive **Incarceration Reduction Engine**. The platform will now support the entire lifecycle of post-conviction advocacy, including Direct Appeals, Clemency, and Administrative Sentence Audits.

## 1. Expanded Functional Domains

### 1.1. Direct Appeal Auditor (The "Four Corners" Specialist)
*   **Mission:** Identify reversible legal errors within the trial record (Clerk's Record & Reporter's Record) within the 30-day filing window.
*   **Key Tasks:**
    *   **Preservation Audit:** Scan transcripts for "Objection" vs. "Overruled" events to see if errors were preserved for appeal.
    *   **Legal Sufficiency Review:** Analyze if the evidence admitted meets the minimum legal standard for each element of the charged offense.
    *   **Jury Charge Audit:** Cross-reference the final jury charge against Texas Pattern Jury Charges to find instructional errors.

### 1.2. Clemency & Commutation Strategist
*   **Mission:** Build persuasive application packets for the Texas Board of Pardons and Paroles (BPP).
*   **Key Tasks:**
    *   **Subject's Version Synthesis:** Transform raw interview data and case facts into a persuasive personal narrative.
    *   **Rehabilitation Evidence Mapping:** Track and categorize institutional achievements (certificates, work reports) to support commutation requests.
    *   **Trial Official Audit:** Identify which current trial officials (Judge, DA, Sheriff) are most likely to provide the mandatory recommendation for commutation based on their public record.

### 1.3. Sentence & Time-Served Auditor
*   **Mission:** Ensure every day of incarceration is correctly credited under Articles 42.03 and 44.29.
*   **Key Tasks:**
    *   **Back-Time Calculation:** Audit the "Judgment and Sentence" documents against arrest records to ensure all pre-trial jail time was credited.
    *   **Parole Eligibility Projection:** Calculate "Good Time" and "Work Time" impact on parole windows, specifically for non-3g (non-aggravated) offenses.
    *   **State Jail Diligent Participation:** Audit work/education logs to trigger the 20% sentence reduction under Art. 42A.559.

---

## 2. Architectural Updates for Expanded Scope

### 2.1. New Agent Personas
| Persona | Role | Data Focus |
| :--- | :--- | :--- |
| **Appellate Auditor** | Formal Legal Error Detection | Trial Record Only (Four Corners) |
| **Clemency Strategist** | Narrative & Equity Building | Institutional Records + Personal Bio |
| **Time-Served Auditor** | Administrative Audit | TDCJ Logs + Judgments |

### 2.2. New MCP Tool Sets
*   **`mcp-tx-appellate-rules`:** Tools for TRAP (Texas Rules of Appellate Procedure) deadlines and formatting.
*   **`mcp-tdcj-policy-expert`:** Tools for parsing TDCJ disciplinary and classification rules for parole impact.
*   **`mcp-tx-jury-charges`:** Authoritative access to current Pattern Jury Charges.

### 2.3. Knowledge Graph Expansion
*   **New Nodes:** `InstitutionalRecord`, `Achievement`, `TimeCredit`, `AppellatePoint`.
*   **New Relationships:**
    *   `(Achievement)-[:SUPPORTS]->(ClemencyApplication)`
    *   `(Objection)-[:NOT_MADE]->(LegalError)` (Highlights potential IAC for writ phase).

---

## 3. Workflow Implementation: The "Escalation Ladder"
HabeasGraph will now automatically route a case through the "Escalation Ladder" based on the finality of the conviction:
1.  **Level 1 (Post-Verdict):** Direct Appeal Audit (Focus on record errors).
2.  **Level 2 (Post-Mandate):** Article 11.07 Writ Interrogation (Focus on constitutional errors outside the record).
3.  **Level 3 (Incarceration):** Time-Served Audit & Clemency Strategy (Focus on administrative release).
