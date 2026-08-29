# HabeasGraph: Detailed Application Execution Roadmap

> **Status (Aug 2026): historical build record.** Forward work is planned in `../mvp_v1_implementation_plan.md` (MVP v1.0), which also disposes of legacy code built under these phases (its §5 register). Checkboxes below reflect what was scaffolded, much of it as mocks — see the current-state audit in `../../architecture/mvp_v1_system_design.md` §1 before relying on any item as "done."

This document provides the granular, task-by-task engineering blueprint for implementing the five phases defined in the `full_implementation_plan.md`. This roadmap transitions the project from architectural theory to actionable engineering sprints.

---

## Phase 1: Foundation & Security
*Objective: Stand up the tripartite database infrastructure and secure the application against cross-tenant data leaks.*

### Task 1.1: Docker Compose Provisioning
- [x] Create `docker-compose.yml` in the monorepo root.
- [x] Configure `postgres` container using the `pgvector/pgvector:pg16` image.
- [x] Configure `neo4j` container with `APOC` plugins enabled for graph algorithms.
- [x] Configure `redis` container (Alpine) for BullMQ background jobs.
- [x] Configure local volume mounts to ensure database persistence during development.

### Task 1.2: Prisma Schema & Row-Level Security (RLS)
- [x] Initialize Prisma in `packages/database`.
- [x] Define the `Tenant` and `User` models.
- [x] Define the `AuditLog` model (Action, UserID, Timestamp, ResourceID).
- [x] Write raw SQL migrations to enforce PostgreSQL RLS:
  - Create a Postgres role for the application.
  - Set `current_setting('app.current_tenant_id')` for the session.
  - Apply `CREATE POLICY` to ensure users can only `SELECT/UPDATE/DELETE` where `tenant_id` matches the session.
- [x] Write raw SQL trigger to make the `AuditLog` table strictly append-only.

### Task 1.3: NextAuth & IAM Implementation
- [x] Install `next-auth` (v5/Auth.js) in `apps/web`.
- [x] Configure the Prisma adapter to sync users to the database.
- [x] Extend the JWT callback to include the user's `tenantId`.
- [x] Implement Prisma middleware/extensions in `packages/database` to inject the JWT's `tenantId` into every database transaction.

---

## Phase 2: Ingestion & Knowledge Graph
*Objective: Build the pipeline capable of turning massive unstructured PDFs into a queryable semantic vector store and an evidence-lineage graph.*

### Task 2.1: S3 Presigned URL Upload Flow
- [x] Configure S3 (or MinIO for local dev).
- [x] Build a Fastify endpoint `POST /api/upload/url` to generate a presigned S3 put URL.
- [x] Build a frontend dropzone component to upload files directly to S3 (bypassing Fastify RAM limits).
- [x] Build a Fastify webhook `POST /api/upload/complete` to register the document in Postgres and queue a BullMQ job.

### Task 2.2: Docling & pgvector Pipeline
- [x] Create a BullMQ worker service in `apps/api`.
- [x] Integrate the `Docling` library to parse the PDF, extracting text while preserving structural metadata.
- [x] Implement hierarchical chunking logic:
  - Group text by Document -> Page -> Paragraph.
- [x] Call the embedding model (Ollama `nomic-embed-text` or OpenAI) for each chunk.
- [x] Insert chunks and vectors into the `pgvector` table using HNSW indexing for rapid retrieval.

### Task 2.3: Neo4j Entity Extraction & Resolution
- [x] Create a secondary LangChain/Ollama worker job.
- [x] Pass document chunks to Llama 3 to extract Entities (Witnesses, Dates, Locations).
- [x] Implement "Entity Resolution" logic to merge aliases (e.g., "John Doe" and "Mr. Doe").
- [x] Push Nodes `(Person)`, `(Event)`, `(Evidence)` and Edges `[:TESTIFIED_IN]`, `[:SUPPORTS]` to Neo4j.

---

## Phase 3: Smart Chat & Agent Orchestration
*Objective: Deploy the conversational interface and the Model Context Protocol (MCP) servers that ground the AI in Texas law.*

### Task 3.1: Core MCP Servers
- [x] Scaffold the `packages/mcp` directory using the official MCP TypeScript SDK.
- [x] Build `mcp-tx-statutes-pro`: Implement tools to search specific sections of the Texas Penal Code and Code of Criminal Procedure.
- [x] Build `mcp-tx-case-law`: Implement tools to query a specialized vector database of Texas Court of Criminal Appeals (CCA) rulings.
- [x] Build `mcp-bluebook-sanitizer`: Implement a strict regex/formatting agent to standardize legal citations.

### Task 3.2: LangGraph State Machine
- [x] Initialize LangGraph.js in `packages/ai`.
- [x] Define the central `GraphState` interface (messages, current_document, identified_claims, required_actions).
- [x] Build the routing logic to pass user queries to the appropriate MCP tools.
- [x] Implement PostgreSQL Checkpoint Saver to persist graph state across user sessions.

### Task 3.3: "Side-by-Side" Workspace UI
- [x] Build the Resizable Panel layout in `apps/web`.
- [x] **Left Pane:** Implement "Parchment Mode" styling for the PDF/Transcript viewer.
- [x] **Right Pane:** Implement the dark-mode Chat interface.
- [x] Implement WebSockets (`fastify-socket.io`) to stream LangGraph token generation and tool-call events to the UI in real-time.

---

## Phase 4: Incarceration Reduction & Final Synthesis
*Objective: Automate the discovery of specific constitutional claims and export them into court-ready formats.*

### Task 4.1: Specialized Personas (Agents)
- [x] **IAC Auditor:** Build a specialized prompt/agent that queries `pgvector` for trial objections and cross-references them against `mcp-tx-case-law` to find "Failure to Object" claims.
- [x] **Brady Auditor:** Build an agent to diff the "Pre-Trial Disclosure" document against the "Trial Transcript" to find undisclosed evidence.

### Task 4.2: The Writ Formatter (CREAC)
- [x] Build a drafting agent strictly instructed to use the **CREAC** format (Conclusion, Rule, Explanation, Application, Conclusion).
- [x] Ensure the agent calls `mcp-bluebook-sanitizer` for every citation before appending it to the state.

### Task 4.3: DOCX Export Service
- [x] Integrate `docx` (or similar OpenXML library) in `apps/api`.
- [x] Build templates for the Texas Article 11.07 Master Sheets.
- [x] Map the verified claims from the LangGraph state into the DOCX template.
- [x] Automatically generate the Table of Authorities based on the citations used.

---

## Phase 5: Early Pipeline Expansion
*Objective: Expand HabeasGraph to encompass Pre-Trial ingestion and integrate with third-party ecosystems.*

### Task 5.1: Multimedia Ingestion
- [x] Set up an FFmpeg worker queue in BullMQ to extract audio from massive Axon bodycam and jail call video files.
- [x] Build `mcp-axon-transcriber`: Integrate local Whisper models (via `whisper.cpp` or API) to transcribe the audio.
- [x] Inject timestamped text transcripts into the standard `pgvector` pipeline.

### Task 5.2: Ecosystem Integrations (OAuth)
- [x] Build the OAuth2 callback handler in `apps/web` to authorize third-party apps.
- [x] Build `mcp-clio-sync`: Implement tools to read/write to the Clio API (syncing client metadata and deadlines to the Postgres database).
- [x] Build webhook listeners in Fastify to monitor PACER/RECAP for docket updates, triggering LangGraph alerts when opposing counsel files a document.
