# HabeasGraph: Texas Incarceration Reduction Engine

HabeasGraph is a high-fidelity Legal AI platform specifically engineered for the entire lifecycle of **Texas Post-Conviction Advocacy**. It transforms massive trial and institutional records into structured legal intelligence, allowing attorneys to identify paths to release via **Direct Appeals**, **Article 11.07 Writs**, **Clemency Applications**, and **Administrative Sentence Audits**.

---

## 1. Current Status: Fully Implemented Architecture

The core five-phase execution roadmap and three-phase UX buildout are completely implemented. HabeasGraph operates a seamless "Intelligence Loop":

- **The Bento Dashboard (Triage):** Rapidly ingests raw PDFs and MP4 bodycam footage, generating a Red/Amber/Green Viability Scorecard for Clinic Directors to allocate resources.
- **The Knowledge Graph (Discovery):** A force-directed Neo4j graph that visualizes the chronological timeline, allowing Investigators to instantly see connections via hover-state illumination.
- **Side-by-Side Workspace (Drafting):** A "Parchment Mode" transcript viewer where Attorneys can highlight text to instantly trigger LangGraph agents to draft CREAC arguments and sanitize citations into a downloadable `.docx` Article 11.07 Master Sheet.

---

## 2. Architecture Overview

The platform utilizes a **Tripartite Data Strategy** and **Stateful Multi-Agent Orchestration**:

### 2.1. Data Strategy

- **Relational (PostgreSQL):** Multi-tenant case data, user sessions, and **Immutable Audit Logs** protected by database triggers.
- **Vector (pgvector):** Hierarchical document chunks with metadata (Page/Line/Header) for precise RAG grounding. It unifies both written transcripts and FFmpeg/Whisper-transcribed multimedia.
- **Graph (Neo4j):** A "Lineage of Evidence" graph mapping relationships between witnesses, evidence, charges, and Clio-synced Attorney-Client relationships.

### 2.2. AI Reasoning Layer

- **LangGraph.js:** A stateful workflow engine that manages multi-agent reasoning, persistence, and human-in-the-loop review.
- **MCP (Model Context Protocol):** Specialized servers providing grounded access to Texas statutes, CCA case law, strict Bluebook formatting, and Axon bodycam audio.
- **Hybrid Model Routing:** Primary reasoning via local **Ollama (Llama 3)**, with escalation to **Gemini 1.5 Pro** for complex legal drafting.

---

## 3. Monorepo Structure

```text
legal-ai-monorepo/
├── apps/
│   ├── web/               # Next.js 14 Frontend - Bento Dashboard, Graph, Workspace
│   └── api/               # Fastify Backend - Orchestration, BullMQ Workers, Export Service
├── packages/
│   ├── ai/                # LangGraph state machines, Specialized Personas (IAC/Brady)
│   ├── database/          # Prisma Schema (RLS), pgvector, Neo4j connection
│   ├── mcp/               # Model Context Protocol servers (Statutes, Case Law, Clio, Axon)
│   ├── auth/              # NextAuth.js shared configurations
│   ├── ui/                # Shared Design System
│   └── tsconfig/          # Shared TypeScript configurations
```

---

## 4. Setup & Installation

### 4.1. Automated Setup (Recommended)

For new developers, we provide an automated setup script that handles dependencies, environment configuration, and database initialization:

```bash
./setup.sh
```

### 4.2. Manual Setup

If you prefer to set up the project manually or need to troubleshoot, follow these steps:

#### Prerequisites

- **Node.js LTS** (v20+)
- **pnpm** (v11+)
- **Docker & Docker Compose**
- **Ollama** (Running locally for failover/entity resolution)

#### Environment Configuration

Copy the example environment file and fill in your keys:

```bash
cp .env.example .env
```

#### Install Dependencies
```bash
# If using pnpm v11+, you may need to approve build scripts first:
# pnpm approve-builds @prisma/client @prisma/engines esbuild fastify-socket.io msgpackr-extract prisma

pnpm install
```

---

## 5. Build & Run

### 5.1. Infrastructure

Start the database (pgvector), cache (Redis), and graph (Neo4j) services. We recommend using Docker Compose v2:

```bash
docker compose up -d
```
*(Note: If you encounter port conflicts, adjust the host ports in `docker-compose.yml` and `.env` accordingly).*

### 5.2. Database Initialization

Prisma requires the `.env` file to be accessible in the database package directory to apply schema changes.

```bash
# Copy the environment file to the database package
cp .env packages/database/.env

# Generate the Prisma Client
pnpm --filter @hg/database db:generate

# Push the schema to the database
pnpm --filter @hg/database db:push

# Seed the system tenant and admin
pnpm run db:seed:prod
```

### 5.3. Development Mode

Run all applications and packages in parallel with Hot Module Replacement (HMR):

```bash
pnpm dev
```

### 5.4. Production Build & Execution

For production environments, you must build the optimized static assets and run them using a process manager (like PM2) or Docker containers. Never use `pnpm dev` in production.

```bash
# 1. Compile the Next.js static assets and Fastify CJS bundles
pnpm build

# 2. Start the Backend API via PM2
NODE_ENV=production pm2 start apps/api/dist/index.js --name "habeas-api"

# 3. Start the Frontend via PM2
cd apps/web
NODE_ENV=production pm2 start "pnpm start" --name "habeas-web"
```

For full details on containerized deployments, Kubernetes rollout, and the CI/CD pipeline, please refer to:
👉 `docs/development/deployment_guide.md`

---

## 6. Testing & CI/CD

### 6.1. Test Suites

- **Unit/Integration:** `pnpm test` (Powered by Vitest)
- **End-to-End:** `pnpm --filter web exec playwright test`

### 6.2. CI Pipeline (GitHub Actions)

The pipeline (`.github/workflows/ci.yml`) enforces strict quality gates on every PR:

1. **Lint & Format:** Ensures code style and architecture alignment.
2. **Build Verification:** Runs Turborepo builds to ensure dependency resolution without errors.
3. **Unit Tests:** Runs the full Vitest suite (>80% coverage required).
4. **E2E Tests:** Deploys a transient Docker environment to run Playwright workflow simulations.

---

## 7. Design Standards: "Industrial Authority"

The UI follows a strict design system defined in `docs/design/ui_design_system.md`:

- **Colors:** Midnight Navy (`#0B0E14`), Law Gold (`#D4AF37`).
- **Typography:** Geist Sans for UI, IBM Plex Serif for Legal documents.
- **Patterns:** Bento-style dashboards, Side-by-Side Analysis, and Parchment Mode for transcripts.

---

## 8. Compliance & Security

- **Multi-Tenancy:** Enforced via PostgreSQL Row-Level Security (RLS).
- **Immutability:** Audit logs are protected by database-level `BEFORE UPDATE OR DELETE` triggers.
- **Zero-Retention:** Ephemeral sessions use encrypted RAM volumes for document processing.
