# Phase 3: Smart Chat & LangGraph Integration - Detailed Task List

## 1. Stateful AI Orchestration (LangGraph.js)

### Task 3.1: Interrogator Graph Design
- [x] Define the LangGraph state machine structure in `packages/ai`.
- [x] Implement nodes: `Supervisor` (Router), `Researcher` (Vector/Graph Search), `Auditor` (MCP Tool Calling), and `Synthesizer` (Drafting).
- [x] Implement conditional edges for cyclical reasoning (e.g., "If findings are incomplete, return to Research").
- [x] **Documentation:** `docs/ai/langgraph_state_machine.md` featuring a visual graph of the multi-agent logic flow.
- [x] **Test Case:** Trace a complex query; verify the graph visits the correct nodes in the expected sequence.

### Task 3.2: Graph Persistence & Checkpointing
- [x] Implement the `PostgresSaver` checkpointer for LangGraph.js.
- [x] Ensure that every state change is saved to the `GraphState` table in PostgreSQL.
- [x] Implement "Session Resumption" logic so users can return to long-running analysis.
- [x] **Documentation:** `docs/ai/persistence_strategy.md` detailing the state schema and checkpointing frequency.
- [x] **Test Case:** Start a multi-turn analysis; simulate a server restart; verify the agent resumes from the last saved state.

### Task 3.3: Human-in-the-Loop (HITL) Breakpoints
- [x] Implement `interrupts` in LangGraph for critical decision points (e.g., before finalizing an IAC claim).
- [x] Create the API bridge to notify the Next.js UI when the graph is "Waiting for Input."
- [x] Implement the "Review & Resume" logic where the agent incorporates attorney edits into the state.
- [x] **Documentation:** `docs/ai/hitl_workflow.md` defining the specific events that trigger a mandatory human review.
- [x] **Test Case:** Trigger an analysis that requires review; verify the graph pauses, allows an edit via the UI, and correctly resumes with the new data.

---

## 2. Specialized MCP Server Ecosystem

### Task 3.4: Statute & Case Law Servers
- [x] Develop `mcp-tx-statutes-pro` (Node.js) with tools for point-in-time statute retrieval.
- [x] Develop `mcp-tx-case-law` (Python/FastAPI) with tools for CCA-specific precedent search.
- [x] Implement secure authentication for the MCP servers to prevent unauthorized access.
- [x] **Documentation:** `docs/mcp/tx_legal_tools.md` detailing the input/output schemas for every provided tool.
- [x] **Test Case:** Query `mcp-tx-statutes-pro` for a penal code section active in 1995; verify the returned text matches the historical version.

### Task 3.5: Forensic Science Registry Server
- [x] Build the `mcp-forensic-science-registry` server.
- [x] Integrate a database of scientific method statuses (e.g., NAS/PCAST reports).
- [x] Implement the `check_method_status` tool.
- [x] **Documentation:** `docs/mcp/forensic_science_spec.md` mapping forensic methodologies to their legal/scientific standings.
- [x] **Test Case:** Query "bite mark comparison"; verify the tool returns a "Discredited" status with supporting citations.

---

## 3. High-Density Smart Chat (Frontend)

### Task 3.6: Side-by-Side Analysis Workspace
- [x] Implement the resizable split-pane layout using `react-resizable-panels`.
- [x] **Communication Enhancement:** Transition Smart Chat to **WebSockets (Socket.io)** for persistent, low-latency AI reasoning updates.
- [x] **Left Pane:** PDF Viewer with line-level highlighting.
- [x] **Documentation:** `docs/ui/workspace_patterns.md` detailing the WebSocket event schema.
- [x] **Test Case:** Open multiple chat sessions; verify WebSocket messages are correctly isolated and routed to the corresponding `jobId`.

### Task 3.7: Interactive Citation & Deep Linking
- [x] Implement a custom Markdown component for legal citations (`[Page 12, Line 4]`).
- [x] **Action:** Clicking the citation must trigger a scroll and highlight event in the PDF Viewer.
- [x] Implement "Graph Snippets"—inline, interactive Neo4j relationship views within the chat.
- [x] **Documentation:** `docs/ui/interactive_components.md` defining the citation link protocol and graph rendering logic.
- [x] **Test Case:** Click an AI-generated citation; verify the PDF viewer scrolls to the exact coordinates and applies a highlight.

---

## 4. Hybrid Reasoning & Model Failover

### Task 3.8: Tripartite Retrieval & Failover Logic
- [x] Implement the master `RetrievalChain` (Vector, Graph, MCP).
- [x] **Model Enhancement:** Implement **Failover Policy** in the `ModelRouter`. If Gemini is unreachable, automatically route high-priority reasoning to a local Llama 3 70B instance.
- [x] **Documentation:** `docs/ai/hybrid_reasoning_strategy.md` explaining the failover logic and data source weights.
- [x] **Test Case:** Simulate a Gemini API failure; verify the agent successfully completes a basic research task using the local failover model.

---

## Phase 3 Verification Milestone
- [x] The Smart Chat can correctly answer a complex legal question by citing a statute, a case law precedent, and a specific page/line of the trial transcript.
- [x] The agent's "thought process" is visible, persisted, and can be interrupted for human correction.
- [x] Clicking a graph node in the chat allows the user to explore related evidence/witnesses.
