# UX Implementation Plan & Testing Strategy

This document outlines the detailed execution roadmap for building out the frontend user experiences for the three core personas: The Clinic Director (Bento Dashboard), the Mitigation Specialist (Knowledge Graph), and the Lead Appellate Attorney (Enhanced Side-by-Side Workspace). It also establishes the comprehensive testing and quality assurance strategy.

## Phase 1: The Bento Dashboard (Clinic Director Workflow)
*Objective: Build the high-density triage dashboard with ingestion animations and semantic viability scorecards.*

### Task List
- [x] Scaffold `apps/web/app/dashboard/page.tsx` using Next.js App Router.
- [x] Implement the dark surface layout (`#161B22`).
- [x] Build the Drag-and-Drop Ingestion Zone component.
- [x] Implement the "Listening Pulse" animation (`framer-motion`) glowing in Law Gold (`#D4AF37`) during file processing.
- [x] Build the "Viability Scorecard" module with Red/Amber/Green semantic indicators (`#F85149`, `#D29922`, `#3FB950`).
- [x] Connect the dashboard to Fastify polling or WebSockets to reflect real-time LangGraph status updates.
- [x] **Documentation:** Update `ui_design_system.md` to document the exact Tailwind configuration for the Listening Pulse.

### Test Use Cases
- **TC-1.1:** Dragging a `.zip` file into the ingestion zone immediately triggers the Law Gold pulse animation.
- **TC-1.2:** The Viability Scorecard correctly renders a green `#3FB950` indicator when the API returns a positive IAC claim finding.
- **TC-1.3:** The dashboard grid maintains responsiveness and does not break alignment on 1024px screens.

---

## Phase 2: The Force-Directed Knowledge Graph (Mitigation Specialist Workflow)
*Objective: Render a highly interactive, physics-based graph of Neo4j entities to enable non-linear chronological discovery.*

### Task List
- [x] Install `react-force-graph-2d` and `d3-force` dependencies in `apps/web`.
- [x] Create `apps/web/components/KnowledgeGraph.tsx`.
- [x] Fetch mock graph data (Nodes: Witnesses/Events, Edges: Mentions/Relationships).
- [x] Style nodes as 12px "Squircles" matching the Industrial Authority design system.
- [x] Implement the hover-state logic: Hovering over a node highlights all connected edges in Law Gold (`#D4AF37`) and dims unconnected nodes.
- [x] Integrate the component into `apps/web/app/workspace/[caseId]/graph/page.tsx`.
- [x] **Documentation:** Update `docs/architecture/website_architecture.md` to reflect the graph rendering library choice.

### Test Use Cases
- **TC-2.1:** Graph renders at least 500 nodes at 60 FPS without crashing the browser thread.
- **TC-2.2:** Hovering over a 'Person' node instantly highlights exactly their connected 'Event' edges.
- **TC-2.3:** Clicking a node opens a side-panel displaying the raw JSON metadata for that entity.

---

## Phase 3: Enhanced Deep Work Interactivity (Lead Attorney Workflow)
*Objective: Upgrade the Side-by-Side workspace to support text-highlighting triggers for automated CREAC drafting and citation sanitization.*

### Task List
- [x] Modify `apps/web/app/workspace/[caseId]/page.tsx` to listen for text-selection events in the left "Parchment Mode" pane.
- [x] Build a floating action menu that appears near the cursor upon text selection with options: "Sanitize Citation" and "Draft Argument".
- [x] Wire the floating actions to automatically populate the right pane's chat input and submit the query via WebSocket.
- [x] **Documentation:** Update `docs/design/user_journeys.md` with screenshots of the highlighting workflow.

### Test Use Cases
- **TC-3.1:** Selecting text in the Parchment pane successfully displays the floating action menu within 100ms.
- **TC-3.2:** Clicking "Sanitize Citation" sends the exact highlighted string to the Fastify WebSocket and returns a Bluebook-compliant format.

---

## Overall Test Plan Strategy

To ensure institutional-grade reliability, HabeasGraph will employ a three-tiered testing strategy:

1. **Unit Testing (Vitest)**
   - All stateless UI components (e.g., Scorecard indicators, chat bubbles) will have Vitest snapshots.
   - Utility functions parsing graph data will have >90% test coverage.

2. **Integration Testing (React Testing Library)**
   - Test the interaction between the React UI state and the WebSocket connection.
   - Verify that simulated incoming LangGraph events correctly update the UI.

3. **End-to-End (E2E) Testing (Playwright)**
   - Playwright will simulate the entire "Intelligence Loop":
     1. Logging in as Clinic Director.
     2. Uploading a docket.
     3. Viewing the green viability score.
     4. Switching to the Investigator persona to view the Graph hover states.
     5. Switching to the Attorney persona to highlight text and export the DOCX.
   - E2E tests must verify accessibility (WCAG 2.1 AA compliance) for the high-contrast modes.
