# MCP Integration Strategy

## Overview
The **Model Context Protocol (MCP)** will be the backbone of the "Legal Intelligence" in this platform. Instead of embedding legal knowledge into the main LLM prompt, we will use MCP servers to provide dynamic, up-to-date legal "tools."

## Proposed MCP Servers

### 1. `mcp-tx-statutes`
*   **Source:** Official Texas Constitution and Statutes (scraped or via API).
*   **Tools:**
    *   `get_statute(code, section)`: Returns the full text of a specific law.
    *   `search_statutes(query)`: Finds relevant laws based on keywords.
    *   `get_statute_at_date(code, section, date)`: Crucial for sentencing audits to find the law as it existed when the offense occurred.

### 2. `mcp-tx-procedural-expert`
*   **Source:** Texas Code of Criminal Procedure, CCA Rules, and Texas Rules of Evidence.
*   **Tools:**
    *   `validate_deadline(filing_type, event_date)`: Calculates writ deadlines.
    *   `get_evidentiary_rule(rule_number)`: Provides the specific rule for objections.
    *   `check_exhaustion_path(claims)`: Maps out the necessary state court steps for habeas.

### 3. `mcp-tx-case-law`
*   **Source:** Local vector database of Texas CCA and SCOTUS rulings relevant to PCR.
*   **Tools:**
    *   `find_precedent(legal_issue)`: Returns top 3 relevant cases with specific holdings.
    *   `check_overruled(case_citation)`: Verifies if a case is still "good law."

### 4. `mcp-forensic-science`
*   **Source:** Scientific reports (NAS, PCAST) and Art. 11.073 precedents.
*   **Tools:**
    *   `is_junk_science(method_name)`: Returns the current scientific and legal status of a forensic technique.
    *   `get_expert_critique(method_name)`: Provides standard "rebuttal" points for discredited science.

## Integration Architecture

1.  **Orchestrator:** The main LLM (Gemini 1.5 Pro) acts as the primary "thinker."
2.  **MCP Client:** The Node.js/TypeScript backend implements the MCP Client.
3.  **Discovery:** When the Orchestrator identifies a legal concept (e.g., "The sentence seems too high"), it calls an MCP tool (e.g., `mcp-tx-statutes.search_statutes`) to gather ground-truth facts.
4.  **Synthesis:** The Orchestrator combines the transcript data with the MCP-provided legal facts to generate the final analysis.
