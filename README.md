# HabeasGraph: Texas Post-Conviction Advocacy Platform

HabeasGraph is a multi-tenant Legal AI platform engineered for the full lifecycle of **Texas Post-Conviction Advocacy**. It transforms trial records and institutional documents into structured legal intelligence, supporting attorneys pursuing **Direct Appeals**, **Article 11.07 Writs**, **Clemency Applications**, and **Administrative Sentence Audits**.

---

## Current Status: MVP (Active Development)

Three core modules are feature-complete with infrastructure fully wired:

| Module | Description |
|--------|-------------|
| **Bento Dashboard** | Ingests PDFs and dockets, extracts metadata via Gemini, enqueues document processing, streams real-time progress |
| **Knowledge Graph** | Force-directed Neo4j graph visualizing entities (persons, evidence, charges) extracted from uploaded documents |
| **Parchment Workspace** | Side-by-side transcript viewer; highlight text to trigger LangGraph agents drafting CREAC arguments |

**Known gaps before production:** chunking uses naive word-splits (not Docling), MCP servers return mock JSON, Axon transcriber is deferred, no Sentry/OpenTelemetry monitoring or API rate limiting.

---

## Architecture

### Data Strategy

- **PostgreSQL + pgvector** — Multi-tenant case data, user sessions, immutable audit logs, and 768-dim vector embeddings for semantic search
- **Neo4j** — Lineage-of-evidence graph mapping relationships between witnesses, charges, and Clio-synced matter data
- **Redis** — BullMQ-backed queue for ingestion, entity extraction, and media processing workers

### AI Reasoning Layer

- **LangGraph.js** — Stateful multi-agent workflow engine with human-in-the-loop checkpointing
- **MCP Servers** — Grounded access to Texas statutes, CCA case law, Bluebook formatter, and Axon bodycam audio
- **Model Routing** — Local Ollama (Llama 3) for entity extraction; Gemini 1.5 Pro for complex drafting

### Auth

NextAuth v4 (JWT strategy) with bcrypt credentials, per-tenant RBAC (ADMIN / ATTORNEY / INVESTIGATOR / VIEWER), route-protection middleware, and session invalidation on password change.

---

## Monorepo Structure

```
legal-ai/
├── apps/
│   ├── web/               # Next.js 14 — Dashboard, Graph, Workspace, Auth pages
│   └── api/               # Fastify 5  — Case/permission APIs, BullMQ workers, SSE
├── packages/
│   ├── ai/                # LangGraph state machines and personas (IAC, Brady)
│   ├── auth/              # NextAuth options, JWT callbacks, token utilities
│   ├── database/          # Prisma schema (RLS), pgvector, Neo4j client
│   ├── mcp/               # MCP servers (statutes, case law, Clio, Axon)
│   ├── ui/                # Shared design system
│   └── tsconfig/          # Shared TypeScript configuration
├── docs/
│   └── specifications/    # PM specs and engineering design documents
└── docker-compose.yml     # Postgres (pgvector), Redis, Neo4j
```

---

## First-Time Setup

### 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v20 LTS+ | `node --version` |
| pnpm | v11+ | `npm install -g pnpm@latest` |
| Docker Engine | Any recent | Rootless Docker works; see Ubuntu note below |
| Git | Any | — |

> **Ubuntu 23.10 / 24.04 — rootless Docker requires an AppArmor fix.**
> Ubuntu 23.10+ blocks unprivileged user namespaces by default. Run once as root to allow `rootlesskit`:
>
> ```bash
> cat <<'EOF' | sudo tee /etc/apparmor.d/home.robbie..local.bin.rootlesskit
> abi <abi/4.0>,
> include <tunables/global>
> /home/robbie/.local/bin/rootlesskit flags=(unconfined) {
>   userns,
>   include if exists <local/home.robbie..local.bin.rootlesskit>
> }
> EOF
> sudo systemctl restart apparmor.service
> ```
> Replace `/home/robbie` with your actual home directory if different.
> Then complete rootless Docker setup: `~/.local/bin/dockerd-rootless-setuptool.sh install`

### 2. Clone and Install

```bash
git clone <repo-url> legal-ai
cd legal-ai
pnpm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Open `.env` and fill in the required values (see [Environment Variables](#environment-variables) below). The minimum required for local development:

```bash
NEXTAUTH_SECRET="<run: openssl rand -hex 32>"
TOKEN_SECRET="<run: openssl rand -hex 32>"    # must differ from NEXTAUTH_SECRET
ADMIN_EMAIL="admin@yourfirm.local"
ADMIN_PASSWORD="<strong-password>"
```

### 4. Start the Docker Daemon

> Skip if Docker Desktop is running or Docker is configured as a system service.

```bash
# Start rootless Docker daemon (persists until logout/reboot)
systemctl --user start docker

# Verify
docker ps
```

> **To start Docker automatically on login:**
> ```bash
> systemctl --user enable docker
> loginctl enable-linger $USER
> ```

### 5. Start Infrastructure Services

```bash
# Start PostgreSQL (pgvector) — required for all development
docker run -d \
  --name legal-ai-postgres \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=legal_ai \
  -p 5433:5432 \
  --restart unless-stopped \
  ankane/pgvector:latest

# Optional: Redis (enables queue workers and Bull Board at /admin/queues)
docker run -d --name legal-ai-redis -p 6379:6379 --restart unless-stopped redis:7-alpine

# Optional: Neo4j (enables knowledge graph visualisation)
docker run -d --name legal-ai-neo4j \
  -e NEO4J_AUTH=neo4j/password \
  -p 7475:7474 -p 7688:7687 \
  --restart unless-stopped \
  neo4j:latest
```

> If you have Docker Compose v2 (`docker compose version`), you can use the provided file instead:
> ```bash
> docker compose up -d
> ```

### 6. Initialise the Database

```bash
# Push schema to the database (creates all tables, enums, and indexes)
pnpm --filter @hg/database db:push

# Seed the initial tenant and admin user
pnpm run db:seed:prod
```

### 7. Start the Dev Server

```bash
pnpm dev
```

This starts both apps via Turborepo with HMR:

| Service | URL |
|---------|-----|
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3001 |
| Bull Board (requires Redis) | http://localhost:3001/admin/queues |

### 8. Sign In

Navigate to http://localhost:3000 and click **Sign In**.

| Field | Value |
|-------|-------|
| Email | Value of `ADMIN_EMAIL` in `.env` (default: `admin@habeasgraph.local`) |
| Password | Value of `ADMIN_PASSWORD` in `.env` (default: `changeme-before-production`) |

> The default password triggers a warning in the seed script. Set `ADMIN_PASSWORD` in `.env` before running `db:seed:prod` on any shared or production environment.

---

## Day-to-Day Development

After the first-time setup, starting a dev session is:

```bash
# 1. Ensure Docker daemon is running (rootless only — skip for Docker Desktop)
systemctl --user start docker

# 2. Ensure the database container is running
docker start legal-ai-postgres     # add legal-ai-redis if you need queue workers

# 3. Start the dev server
pnpm dev
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Default port is **5433** (Docker maps 5433→5432). |
| `NEXTAUTH_SECRET` | Yes | 32-byte random secret for signing JWT session tokens. `openssl rand -hex 32` |
| `NEXTAUTH_URL` | Yes | Full URL of the web app. `http://localhost:3000` for local dev. |
| `TOKEN_SECRET` | Yes | 32-byte random secret for invite and password-reset tokens. Must differ from `NEXTAUTH_SECRET`. |
| `ADMIN_EMAIL` | Yes | Email for the seeded admin account. |
| `ADMIN_PASSWORD` | Yes | Password for the seeded admin account. |
| `REDIS_URL` | No | Redis connection string. Queue workers and Bull Board are disabled when Redis is unreachable. |
| `NEO4J_URI` | No | Neo4j Bolt URI. Knowledge graph features degrade gracefully without it. |
| `GEMINI_API_KEY` | No | Gemini 1.5 Pro API key. Required for document metadata extraction on case upload. |
| `OLLAMA_BASE_URL` | No | Ollama base URL. Required for local entity extraction. Default: `http://localhost:11434`. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | No | S3 credentials for document storage. Dev uploads work without these (S3 step is skipped gracefully). |
| `S3_BUCKET` | No | S3 bucket name for documents. S3 direct uploads support up to 5 GB (pre-signed PUT). The API multipart limit (preview extraction) is 500 MB. |
| `SYSTEM_TENANT_NAME` | No | Display name for the seeded tenant. Default: `HabeasGraph System`. |

---

## Schema Changes

When the Prisma schema (`packages/database/prisma/schema.prisma`) is modified:

```bash
# Regenerate the Prisma client types
pnpm --filter @hg/database db:generate

# Apply changes to the running database (development only — use migrations in production)
pnpm --filter @hg/database db:push
```

---

## Testing

```bash
# Unit and integration tests (Vitest)
pnpm test

# End-to-end tests (Playwright) — requires dev server running
pnpm --filter web exec playwright test
```

---

## Production Build

```bash
# Build all apps and packages
pnpm build

# Start the API (Node.js)
NODE_ENV=production node apps/api/dist/index.js

# Start the web app
cd apps/web && NODE_ENV=production pnpm start
```

For containerised deployments and CI/CD pipeline details see `docs/development/deployment_guide.md`.

---

## Security & Compliance

- **Row-Level Security** — All PostgreSQL queries are scoped to the authenticated tenant via `app.current_tenant_id`. No cross-tenant data leakage is possible at the query layer.
- **Immutable Audit Logs** — `AuditLog` rows are protected by database-level `BEFORE UPDATE OR DELETE` triggers.
- **Zero-Retention AI** — Document text is processed in-memory and never stored in AI provider logs (Ollama runs locally; Gemini calls use ephemeral sessions).
- **Session Invalidation** — Changing a password sets `passwordChangedAt`; all other active sessions are invalidated on their next request.
- **Token Security** — Invite and password-reset tokens are SHA-256 hashed before storage. Only the raw token (sent in the email link) can verify; the stored hash is useless to an attacker with DB access.
