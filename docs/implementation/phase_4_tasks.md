# Phase 4: Texas Use Cases & Final Synthesis - Detailed Task List

## 1. Specialized Agent Implementations

### Task 4.1: IAC Specialist (Strickland Auditor)
- [x] Implement the specialized LangGraph node for Ineffective Assistance of Counsel (IAC).
- [x] Integrate the **Strickland** prompting logic (Deficiency & Prejudice prongs).
- [x] Connect to `mcp-tx-procedural-expert` to validate if failed objections were viable under Texas Rules of Evidence.
- **Documentation:** `docs/legal/iac_analysis_logic.md` detailing how the agent distinguishes between strategy and oversight.
- **Test Case:** Input a transcript segment where a hearsay objection was missed; verify the agent flags it as "Potential Deficiency" and cites the relevant Rule of Evidence.

### Task 4.2: Brady Auditor (Discovery Gap Detection)
- [x] Implement the node for comparing pre-trial discovery logs against trial testimony.
- [x] Develop the "Materiality" assessment logic (identifying evidence that "undermines confidence in the outcome").
- [x] Integrate Neo4j to trace if undisclosed evidence impacts multiple counts or witnesses.
- **Documentation:** `docs/legal/brady_audit_process.md` mapping the cross-reference logic between discovery and transcripts.
- **Test Case:** Provide a discovery log missing "Witness X statement"; verify the agent flags Witness X's trial testimony as a "Brady Flag."

### Task 4.3: Junk Science Reviewer (Art. 11.073)
- [x] Implement the node for forensic methodology auditing.
- [x] Integrate the `mcp-forensic-science-registry` to identify outdated or discredited methods.
- [x] Implement logic to detect "Overstated Conclusions" in expert testimony (e.g., "100% certainty").
- **Documentation:** `docs/legal/junk_science_standard.md` detailing the threshold for Art. 11.073 eligibility.
- **Test Case:** Analyze testimony involving "bite mark comparison"; verify the agent identifies it as "Discredited" and cites current scientific standards.

---

## 2. The Writ Formatter & CREAC Drafting

### Task 4.4: CREAC Synthesis & Sanitization
- [x] Implement the structured drafting node using the **CREAC** methodology.
- [x] **Precision Enhancement:** Implement the **Bluebook Sanitizer** node. This node validates and corrects AI-generated citations against the `mcp-tx-case-law` data using specialized regex/MCP tools.
- [x] Create the **"Human-in-the-Loop" Review UI**.
- **Documentation:** `docs/output/creac_drafting_guide.md` providing templates for AI-generated legal arguments.
- **Test Case:** Generate an argument for an IAC claim; verify it contains all five CREAC components and correct transcript citations.

### Task 4.5: Automated DOCX Export Service
- [x] Build the backend service to generate court-ready `.docx` files.
- [x] **Asset Enhancement:** Create a `packages/templates` library containing validated **OpenXML (.docx) Master Sheets** for Texas CCA forms.
- [x] **Table of Authorities (TOA):** Implement auto-generation logic.
- [x] **Table of Contents (TOC):** Implement auto-generation logic.
- **Documentation:** `docs/output/docx_export_spec.md` detailing Bluebook formatting rules and document styles.
- **Test Case:** Export a full writ; verify the TOA is accurately categorized and page numbers in the TOC match the final document.

---

## 3. Final UI/UX Polish (Industrial Authority)

### Task 4.6: Bento Dashboard & Navigation
- [x] Implement the high-density **Bento Dashboard** for case management.
- [x] Refine the **"Noir" Global Theme** and the **"Parchment Mode"** transcript viewer.
- [x] Integrate the **"Listening Pulse"** and loading skeleton states as defined in the Design System.
- **Documentation:** `docs/ui/design_system_final.md` documenting the finalized Tailwind tokens and component library.
- **Test Case:** Audit the UI for WCAG 2.1 compliance; verify all contrast ratios in Dark Mode meet the 4.5:1 standard.

---

## 4. Final Validation & Quality Assurance

### Task 4.7: End-to-End Legal Benchmarking
- [x] Perform a full "Moot Case" test: Ingest -> Interrogate -> Review -> Export.
- [x] Verify that **RLS (Row-Level Security)** holds during a high-concurrency multi-tenant test.
- [x] Perform a "Zero-Retention" audit to ensure no sensitive data persists after the session.
- **Documentation:** `docs/qa/final_validation_report.md` summarizing the platform's performance and security benchmarks.
- **Test Case:** Run a Playwright E2E script covering the entire lifecycle; verify successful DOCX generation with zero manual errors.

---

## Phase 4 Verification Milestone
- [x] A complete Article 11.07 writ can be drafted and exported in under 60 minutes.
- [x] The exported document is court-ready with an accurate TOA and TOC.
- [x] The platform's visual identity is consistent, high-density, and accessible.
- [x] Multi-tenancy and data sovereignty are empirically confirmed.
