# HabeasGraph: Full Implementation Plan

## 1. Executive Overview
HabeasGraph is a comprehensive **Incarceration Reduction Engine** specifically engineered for **Texas Post-Conviction Relief (PCR)**. It transforms raw legal records into structured intelligence to support the entire lifecycle of release advocacy, including **Direct Appeals**, **Article 11.07 Habeas Corpus writs**, **Clemency applications**, and **Administrative Sentence Audits**.

## 2. Definitive Tech Stack

### Core Infrastructure
- **Monorepo:** Turborepo with `pnpm`.
- **Frontend:** Next.js 14 (App Router), Tailwind CSS, Shadcn/UI.
- **Backend:** Fastify (Node.js LTS), BullMQ (Redis) for background jobs.
- **Communication:** **WebSockets (Fastify-Socket.io)** for persistent, stateful AI chat updates.
- **Storage:** S3-compatible storage with **Pre-signed URL** upload flow for large transcript handling.
- **Authentication:** NextAuth.js (Auth.js) with strict Multi-Tenant Row-Level Security (RLS), including a secure **OAuth2 Credential Vault** for third-party integrations.
- **Database:** 
  - **PostgreSQL:** Relational data & **Trigger-Protected** Immutable Audit Logs.
  - **pgvector:** Semantic/Hierarchical chunk storage.
  - **Neo4j:** Legal Knowledge Graph (Evidence/Witness lineage).

### AI Reasoning Layer
- **Orchestration:** LangGraph.js (Stateful, cyclical workflows).
- **Primary LLM:** Ollama / Llama 3 (Local, Privacy-first, Cost-optimized).
- **Secondary LLM:** Gemini 1.5 Pro (Complex reasoning & high-context failover).
- **Sanitization:** Dedicated **Bluebook Sanitizer** node for citation precision.
- **Protocol:** Model Context Protocol (MCP) for grounded legal tool access.
- **Multimedia Engine (Phase 5):** Local Whisper models and FFmpeg transcoding queues for Axon bodycam ingestion.

---

## 3. Implementation Roadmap

### Phase 1: Foundation & Security (Weeks 1-2)
- **Monorepo Setup:** Scaffolding `apps/web`, `apps/api`, and `packages/*` as defined in the scaffolding plan.
- **IAM Layer:** Implement NextAuth.js with tenant-aware Prisma middleware to enforce PostgreSQL RLS.
- **Audit System:** Create the append-only `AuditLog` service in the API to track all AI tool calls.

### Phase 2: Ingestion & Knowledge Graph (Weeks 3-4)
- **Document Pipeline:** 
  - Integrate **Docling** for structured PDF parsing.
  - Implement **Hierarchical Chunking** logic (retaining Page/Line/Header metadata).
- **Graph Ingestion:**
  - Build the **Entity Resolution** worker (Ollama-powered) to normalize witnesses/evidence.
  - Implement the Neo4j schema for tracing "Lineage of Evidence."
- **Search:** Configure `pgvector` with HNSW indexing for rapid semantic retrieval.

### Phase 3: Smart Chat & Agent Orchestration (Weeks 5-7)
- **LangGraph State Machine:**
  - Design the central "Interrogator" graph.
  - Implement persistence (saving graph state to Postgres).
  - Add "Human-in-the-Loop" breakpoints for attorney review.
- **MCP Ecosystem:**
  - Develop `mcp-tx-statutes-pro` and `mcp-tx-case-law` servers.
  - Integrate `mcp-forensic-science-registry` for junk science validation.
- **UI Integration:** Build the "Side-by-Side" workspace with deep-linking from chat to the transcript viewer.

### Phase 4: Incarceration Reduction & Final Synthesis (Weeks 8-10)
- **Specialized Personas:**
  - **IAC & Brady Specialists:** Writ-phase gap detection.
  - **Appellate Auditor:** 30-day "Four Corners" record audit.
  - **Clemency Strategist:** BPP application synthesis & achievement mapping.
  - **Time-Served Auditor:** Art. 42.03/44.29 credit auditing.
- **The Writ Formatter:** 
  - Implement **CREAC** structured drafting logic.
  - **Export Service:** Develop the DOCX generator with automated Table of Authorities and Table of Contents.

### Phase 5: Early Pipeline Expansion (Weeks 11-14)
- **Multimedia Ingestion:** Implement FFmpeg processing queues and local Whisper inference for `mcp-axon-transcriber`.
- **Ecosystem Integrations:** Deploy OAuth listeners and webhooks for `mcp-clio-sync` and PACER/RECAP docket monitoring.
- *Strategic Note:* This phase is intentionally deferred to ensure the core post-conviction graph architecture (Phases 1-4) is robust before expanding into pre-trial feature sets.

---

## 4. Design & UX Standards (Industrial Authority)
- **Theme:** Strict Dark Mode (`#0B0E14`) for the Control Center; Parchment Mode for transcripts.
- **Density:** 4px grid alignment, 12px table typography, Bento-style dashboard modules.
- **Typography:** Geist Sans (UI), IBM Plex Serif (Legal Content), Geist Mono (Citations).
- **Interactions:** "Listening Pulse" for AI processing, 1px Blueprint borders, Force-directed graph for Neo4j visualizations.

---

## 5. Quality Assurance & Compliance
- **Validation:** Every AI claim **must** have a grounded citation (MCP tool result) and a source link (Page/Line).
- **Testing:** 
  - **Vitest:** For unit/integration logic.
  - **Playwright:** For critical path E2E tests (Upload -> Analyze -> Export).
- **Security Audit:** Pentesting the tenant-isolation boundary (RLS) and ensuring "Zero-Retention" mode wipes ephemeral data.

## 6. Deployment & Scale
- **Containers:** Docker-based deployment.
- **Scaling:** BullMQ workers on GPU-optimized instances for Ollama/Parsing; API/Web on lightweight Fargate instances.
- **Observability:** Sentry + OpenTelemetry for end-to-end tracing of the multi-agent reasoning chain.
