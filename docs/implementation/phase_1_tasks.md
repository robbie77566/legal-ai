# Phase 1: Foundation & Security - Detailed Task List

## 1. Monorepo & Infrastructure Scaffolding

### Task 1.1: Core Workspace Setup
- [x] Initialize Turborepo with `pnpm`.
- [x] Configure `turbo.json` with pipelines for `build`, `lint`, `test`, and `dev`.
- [x] Setup shared `packages/tsconfig` and `packages/eslint-config`.
- **Documentation:** `README.md` at root detailing the monorepo architecture and script usage.
- **Test Case:** Run `pnpm run build` from root; verify all empty apps/packages pass.

### Task 1.2: Shared Package Initialization
- [x] Scaffold `packages/ui` (Tailwind + Shadcn boilerplate).
- [x] Scaffold `packages/ai` (LangGraph foundation & Model Router shell).
- [x] Scaffold `packages/mcp` (Base MCP client).
- **Documentation:** Internal `README.md` for each package explaining its responsibility.
- **Test Case:** Verify cross-package imports (e.g., `apps/web` can import a dummy constant from `packages/ui`).

---

## 2. Database & Multi-Tenancy (RLS)

### Task 2.1: Schema Refinement
- [x] Implement the `Tenant`, `User`, `Case`, `Document`, and `AuditLog` models in `packages/database/prisma/schema.prisma`.
- [x] Add the `pgvector` extension and the `Unsupported("vector(1536)")` field for embeddings.
- **Documentation:** `docs/security/database_schema.md` explaining the relationship between Users and Tenants.
- **Test Case:** `prisma validate` passes with the new schema.

### Task 2.2: Tenant-Aware Prisma Client
- [x] Create a Prisma middleware/extension in `packages/database` that intercepts queries and sets the `app.current_tenant_id` session variable in PostgreSQL.
- [x] Write the SQL migration to enable **Row-Level Security (RLS)** on all tenant-data tables.
- **Documentation:** `docs/security/rls_implementation.md` detailing how the session variable is injected.
- **Test Case (Critical):** Integration test: 
    1. Create Tenant A and Tenant B.
    2. Create a Case under Tenant A.
    3. Attempt to fetch all cases using a Prisma client initialized with Tenant B's ID.
    4. **Expectation:** Result is empty (Isolation success).

---

## 3. Authentication & IAM

### Task 3.1: NextAuth.js Integration
- [x] Setup NextAuth.js in `packages/auth`.
- [x] Configure the `session` callback to include `tenantId` and `userId` in the JWT/Session object.
- [x] Implement a protected `apps/api` middleware that verifies the NextAuth JWT.
- **Documentation:** `docs/security/auth_flow.md` mapping the login-to-RLS-injection flow.
- **Test Case:** Unit test the `session` callback to ensure `tenantId` is correctly mapped from the database user.

---

## 4. Immutable Audit System

### Task 4.1: Audit Logging Service
- [x] Implement an internal `AuditService` in `apps/api`.
- [x] Ensure the service writes to the `AuditLog` table using the tenant-aware client.
- [x] **SQL Enhancement:** Implement PostgreSQL **Triggers** to prevent `UPDATE` or `DELETE` on the `AuditLog` table.
- [x] Create a standard `LogAction` type (e.g., `AI_TOOL_CALL`, `DOCUMENT_UPLOAD`, `CASE_ACCESS`).
- **Documentation:** `docs/compliance/audit_strategy.md` defining what events are logged and the structure of the `details` JSON field.
- **Test Case:** Verify that an `UPDATE` query on `AuditLog` results in a database error.

---

## 5. Local Development & Deployment Bootstrapping

### Task 5.1: Docker Compose & Prod Seeding
- [x] Configure `docker-compose.yml` with health checks.
- [x] Implement `pnpm run db:seed:prod` to initialize the "System Tenant" and "Master Admin" user via ENV variables.
- [x] Create a `.env.example` with all required keys.
- **Documentation:** `docs/development/setup.md` - A 5-minute guide to a running local environment.
- **Test Case:** `docker-compose up -d` results in 3 healthy containers; API can connect to all three.

---

## Phase 1 Verification Milestone
- [x] All CI checks pass (Lint/Test).
- [x] RLS isolation is empirically verified with an integration test.
- [x] A user can login, and their `tenantId` is successfully passed to the database layer.
