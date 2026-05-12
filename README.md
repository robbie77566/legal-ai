# HabeasGraph: Texas Incarceration Reduction Engine

HabeasGraph is a high-fidelity Legal AI platform specifically engineered for the entire lifecycle of **Texas Post-Conviction Advocacy**. It transforms massive trial and institutional records into structured legal intelligence, allowing attorneys to identify paths to release via **Direct Appeals**, **Article 11.07 Writs**, **Clemency Applications**, and **Administrative Sentence Audits**.

---

## 1. Architecture Overview

The platform utilizes a **Tripartite Data Strategy** and **Stateful Multi-Agent Orchestration**:

### 1.1. Data Strategy

- **Relational (PostgreSQL):** Multi-tenant case data, user sessions, and **Immutable Audit Logs** protected by database triggers.
- **Vector (pgvector):** Hierarchical document chunks with metadata (Page/Line/Header) for precise RAG grounding.
- **Graph (Neo4j):** A "Lineage of Evidence" graph mapping relationships between witnesses, evidence, and charges.

### 1.2. AI Reasoning Layer

- **LangGraph.js:** A stateful workflow engine that manages multi-agent reasoning, persistence, and human-in-the-loop review.
- **MCP (Model Context Protocol):** Specialized servers providing grounded access to Texas statutes, CCA case law, and forensic standards.
- **Hybrid Model Routing:** Primary reasoning via **Gemini 1.5 Pro**, with automatic failover to local **Ollama (Llama 3)** for privacy and continuity.

---

## 2. Monorepo Structure

```text
legal-ai-monorepo/
├── apps/
│   ├── web/               # Next.js 14 Frontend - Smart Chat & PDF Viewer
│   └── api/               # Fastify Backend - Orchestration, Workers, Export Service
├── packages/
│   ├── ai/                # LangGraph state machines, Personas, Sanitizers
│   ├── database/          # Prisma Schema (RLS), pgvector, Neo4j connection
│   ├── mcp/               # Model Context Protocol servers and client
│   ├── auth/              # NextAuth.js shared configurations
│   ├── ui/                # Shared Design System (Geist Sans, Law Gold)
│   ├── templates/         # OpenXML (.docx) Master Sheets for Texas forms
│   └── tsconfig/          # Shared TypeScript configurations
```

---

## 3. Setup & Installation

### 3.1. Prerequisites

- **Node.js LTS** (v20+)
- **pnpm** (v11+)
- **Docker & Docker Compose**
- **Ollama** (Running locally for failover/entity resolution)

### 3.2. Environment Configuration

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

### 3.3. Install Dependencies
```bash
pnpm install
```

---

## 4. Development Workflow
To maintain code quality and CI stability, follow the mandatory **Git & Build Workflow** documented in:
👉 `docs/development/git_workflow.md`

---

## 5. Build & Run


### 4.1. Infrastructure

Start the database (pgvector), cache (Redis), and graph (Neo4j) services:

```bash
docker-compose up -d
```

### 4.2. Database Initialization

Generate the Prisma client and seed the system tenant/admin:

```bash
pnpm run db:seed:prod
```

### 4.3. Development Mode

Run all applications and packages in parallel:

```bash
pnpm dev
```

### 4.4. Production Build

```bash
pnpm build
```

---

## 5. Testing & CI/CD

### 5.1. Test Suites

- **Unit/Integration:** `pnpm test` (Powered by Vitest)
- **End-to-End:** `pnpm --filter web exec playwright test`
- **Security Audit:** `pnpm run audit` (Verification of RLS isolation)

### 5.2. CI Pipeline (GitHub Actions)

The pipeline (`.github/workflows/ci.yml`) executes the following on every PR:

1. **Lint:** Verifies code style and architecture alignment.
2. **Build:** Ensures monorepo dependency resolution.
3. **Test:** Runs the full Vitest suite.
4. **E2E:** Deploys a transient Docker environment to run Playwright benchmarks.

---

## 6. Design Standards: "Industrial Authority"

The UI follows a strict design system defined in `docs/architecture/ui_design_system.md`:

- **Colors:** Midnight Navy (`#0B0E14`), Law Gold (`#D4AF37`).
- **Typography:** Geist Sans for UI, IBM Plex Serif for Legal documents.
- **Patterns:** Bento-style dashboards, Side-by-Side Analysis, and Parchment Mode for transcripts.

---

## 7. Compliance & Security

- **Multi-Tenancy:** Enforced via PostgreSQL Row-Level Security (RLS).
- **Immutability:** Audit logs are protected by database-level `BEFORE UPDATE OR DELETE` triggers.
- **Zero-Retention:** Ephemeral sessions use encrypted RAM volumes for document processing.
