# MCP Agent & Server Ecosystem: Texas Legal AI

This document defines the specialized **Model Context Protocol (MCP)** ecosystem required to support Texas post-conviction relief (PCR) and Article 11.07 habeas corpus workflows.

## 1. Core Data Servers (Tool Providers)
These servers provide the "Ground Truth" tools that AI agents use to validate legal claims.

### 1.1. `mcp-tx-statutes-pro`
*   **Role:** Authoritative access to the Texas Constitution and Statutes.
*   **Tools:**
    *   `get_statute_by_date(section, effective_date)`: Retrieves the law as it existed at the time of the offense (crucial for sentencing audits).
    *   `search_penal_code(query)`: Semantic search across the Texas Penal Code.
*   **Source:** Texas Legislative Council (scraped) or verified API.

### 1.2. `mcp-tx-case-law`
*   **Role:** Access to Texas Court of Criminal Appeals (CCA) and Courts of Appeals rulings.
*   **Tools:**
    *   `find_precedent(legal_issue, county_filter?)`: Returns relevant cases, prioritized by the CCA.
    *   `is_good_law(citation)`: Checks if a case has been overruled or distinguished.
*   **Source:** CourtListener API + Local Vector DB of PCR-specific rulings.

### 1.3. `mcp-forensic-science-registry`
*   **Role:** Validating scientific evidence under Texas Article 11.073 ("Junk Science").
*   **Tools:**
    *   `check_method_status(method_name)`: Returns the current legal/scientific status of a technique (e.g., bite marks, dog scent lineups).
    *   `get_science_rebuttal(method_name)`: Provides standard rebuttal points and expert citations for discredited science.

### 1.4. `mcp-tx-procedural-expert`
*   **Role:** Calculating deadlines and jurisdictional requirements.
*   **Tools:**
    *   `calculate_writ_deadline(judgment_date, appeal_date)`: Computes the precise filing window for Art. 11.07 vs. Federal 2254.
    *   `verify_exhaustion(claims, court_history)`: Checks if every claim has been presented to the CCA.

---

## 2. Specialized Task Agents (Orchestrators)
These are high-level AI agents that use the tools above to perform complex legal analysis.

### 2.1. The Transcript Interrogator (IAC Specialist)
*   **Objective:** Identify Ineffective Assistance of Counsel (IAC) under the *Strickland* standard.
*   **Workflow:**
    1.  Scans trial transcripts for specific "Critical Points" (e.g., introduction of prejudicial evidence).
    2.  Uses `mcp-tx-procedural-expert` to check if an objection was required.
    3.  Checks if trial counsel failed to object.
    4.  Queries `mcp-tx-case-law` for "Failure to Object" precedents relevant to that specific evidence.
*   **Output:** A structured report of potential IAC claims with transcript citations.

### 2.2. The Brady Auditor
*   **Objective:** Detect suppression of exculpatory evidence.
*   **Workflow:**
    1.  Parses the "Motion for Discovery" and "State's Disclosure" documents.
    2.  Extracts every piece of evidence mentioned in witness testimony via the `Transcript Interrogator`.
    3.  Cross-references testimony evidence against the disclosure list.
    4.  Flags any item mentioned at trial that was not disclosed pre-trial.
*   **Output:** A "Brady Flag" timeline showing disclosure gaps.

### 2.3. The 11.073 "Junk Science" Reviewer
*   **Objective:** Identify eligibility for a subsequent writ based on evolving science.
*   **Workflow:**
    1.  Extracts all expert testimony and forensic methods used at trial.
    2.  Queries `mcp-forensic-science-registry` for the current status of each method.
    3.  If a method is now discredited, it searches `mcp-tx-case-law` for recent 11.073 grants related to that method.
*   **Output:** An Art. 11.073 eligibility report.

### 2.4. The Writ Formatter (The Synthesizer)
*   **Objective:** Generate the final Article 11.07 application and court-ready briefs.
*   **Workflow:**
    1.  Collects verified claims from the IAC, Brady, and Junk Science agents.
    2.  Uses `mcp-tx-statutes-pro` to pull the exact language of the violated rights.
    3.  **Argument Construction:** Structures all legal arguments using the strict **CREAC** methodology (Conclusion, Rule, Explanation, Application, Conclusion).
    4.  Formats the output into the official Texas CCA Article 11.07 form layout.
*   **Output:** 
    *   An interactive draft for the "Review & Refinement" UI.
    *   A final, court-ready **DOCX export** that automatically generates the required **Table of Authorities** and **Table of Contents** based on cited `mcp-tx-case-law` tools.

---

## 3. Integration with Neo4j Knowledge Graph

The MCP Agents will feed the **Legal Knowledge Graph** defined in the architecture:
*   When the `Transcript Interrogator` finds a witness, it creates a `(Witness)` node.
*   When the `Brady Auditor` finds a disclosure gap, it creates a `(Evidence)-[:NOT_DISCLOSED]->(State)` relationship.
*   This allows the `Synthesizer` to perform a single graph query to find the "Most Impactful Claims" based on how many charges a single piece of tainted evidence supports.
