# HabeasGraph Test Automation Strategy & Coverage Plan

## 1. Executive Summary
The goal of this testing infrastructure is to ensure **institutional-grade stability** across the HabeasGraph monorepo by enforcing a **90% code coverage threshold**. The testing architecture spans the backend API, workers, local AI/RAG capabilities, and the Next.js frontend UI, utilizing modern, fast, and unified testing frameworks.

## 2. Tools & Infrastructure
We have standardized on the following tooling ecosystem:
- **Vitest**: The primary test runner, chosen for its native ESM support, speed, and seamless integration with Vite and our monorepo structure.
- **@vitest/coverage-v8**: Native V8 engine integration for high-performance coverage reporting.
- **React Testing Library & Jest-DOM**: For testing React components, simulating user interactions, and verifying DOM states.
- **JSDOM**: A headless browser environment used by Vitest for running frontend tests without a real browser.
- **Playwright**: (Optional/Supplemental) Reserved for end-to-end (E2E) UI flows and cross-browser validations, functioning outside the unit test scope.
- **Fastify Inject**: Native HTTP injection for testing API routes without binding to an actual port, avoiding `EADDRINUSE` errors during parallel execution.

## 3. Monorepo Strategy
The monorepo uses `vitest.workspace.ts` to coordinate tests across four primary workspaces. This allows us to run isolated project tests or global unified tests:

### A. `apps/api` (Backend & Workers)
- **Goal**: Ensure secure route resolution, job queueing, and integration with the embedding pipeline.
- **Key Tests**:
  - `api.test.ts`: Validates Fastify server instantiation and API routing logic.
  - `ingestion.test.ts`: Verifies BullMQ worker logic. It ensures PDFs are processed into vectors, mock embeddings are generated, and raw SQL queries queue down-stream graph extraction.
  - `embedding.test.ts`: Mocks the external Google Generative AI / Ollama APIs to guarantee that embedding arrays are generated synchronously.

### B. `packages/database` (Data Layer & Security)
- **Goal**: Validate Prisma queries, raw SQL functions, and Row-Level Security (RLS) policies.
- **Key Tests**:
  - `rls.test.ts`: Ensures that isolated tenants cannot query or mutate data belonging to other organizations.
  - `audit.test.ts`: Validates that Prisma middleware or raw Postgres triggers automatically populate the audit trails for every mutation.

### C. `packages/ai` (Agents & Vector Indexing)
- **Goal**: Validate LangGraph agent orchestration, prompt integrity, and LanceDB RAG indexing pipelines.
- **Key Tests**:
  - `personas.test.ts`: Asserts that specialized agents (like the IAC Specialist) adhere to formatting rules (e.g., IRAC/CREAC) and reference correct standards.
  - `index-codebase.test.ts`: Mocks the file system (`fs/promises`) and tests the vector embedding and LanceDB connection logic safely without writing real vectors to disk.

### D. `apps/web` (Frontend UX & React Components)
- **Goal**: Guarantee 90% UX test coverage by isolating complex components and validating state transitions.
- **Strategy**: Refactor deeply nested inline code into modular components to enable snapshot testing and user event simulation via `@testing-library/react`.
- **Key Tests**:
  - **`ParchmentViewer.test.tsx`**: Validates the rendering of trial transcripts and ensures text selection fires the correct floating action menu callbacks (`handleMouseUp`).
  - **`WorkspacePage.test.tsx`**: Simulates complete user interactions, including clicking the Floating Action Menu, populating the Chat input, sending a message, and verifying the asynchronous UI transitions (User msg -> Status -> Agent reply) using Next.js `waitFor`.
  - **`ViabilityScorecard.test.tsx`**: Asserts that triage scores render correctly with dynamic Tailwind color classes based on LangGraph categorizations.
  - **`KnowledgeGraph.test.tsx` & `HeroGraph.test.tsx`**: Safely mocks dynamic Next.js imports (`next/dynamic`) and `react-force-graph-2d` canvas APIs to prevent SSR crashes in headless DOMs.

## 4. Test Execution & Coverage Enforcement
All tests are integrated into the monorepo root via turbo.

**Run All Tests (Global):**
```bash
pnpm run test:coverage
```
*Note: Ensure databases are seeded and migrations are applied before running the global suite.*

**Run Isolated Frontend Tests:**
```bash
pnpm run test:coverage --project=web
```

### Coverage Thresholds
The `vitest.config.ts` enforces the following thresholds using the V8 provider:
- **Statements/Lines**: > 90%
- **Functions**: > 90%
- **Branches**: > 90%

*Note: The global test suite will fail the CI/CD pipeline if any package falls below the 90% threshold line.*

## 5. Known Limitations & Mitigation
- **Rust Query Engine panics**: Prisma's Rust core occasionally panics when multiple workspaces execute queries simultaneously in a fast parallel JSDOM environment. *Mitigation: Run database tests in isolation, or disable cross-workspace parallelization (`pool: forks`) if issues persist.*
- **ESM / React Transforms**: Vitest requires manual JSX injection (`esbuild: { jsxInject: "import React from 'react'" }`) inside `vitest.config.mts` for Next.js app router projects that utilize modern React transform patterns without explicit imports.
