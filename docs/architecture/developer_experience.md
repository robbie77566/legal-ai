# Developer Experience (DX) & RAG-Driven Development

To ensure the complexity of the HabeasGraph platform (MCP Agents, Neo4j, Next.js Monorepo) remains manageable, we will employ a **Codebase RAG** workflow (e.g., via Cursor, GitHub Copilot, or Continue.dev).

## 1. The "Architecture-Aware" Workflow
By indexing the `docs/` folder, the RAG system provides three critical benefits during development:

### 1.1. Architecture Linting
When a developer or AI agent (like Gemini CLI) creates a new feature, the RAG system validates it against `docs/architecture/website_architecture.md`.
*   **Example:** If a developer tries to store complex witness relationships in PostgreSQL instead of Neo4j, the RAG-enabled assistant can flag this as a deviation from the architectural mandate.

### 1.2. MCP Schema Consistency
Developing multiple MCP servers (`mcp-tx-statutes`, `mcp-tx-case-law`, etc.) requires consistent tool definitions.
*   **RAG Role:** It uses existing server implementations as "few-shot" examples to generate boilerplate for new servers, ensuring that input/output schemas follow the same naming conventions and error-handling patterns.

### 1.3. Cross-Boundary Type Safety
In a monorepo, types often bridge the gap between the Fastify backend and Next.js frontend.
*   **RAG Role:** It allows the assistant to "see" the Prisma schema and the Fastify DTOs (Data Transfer Objects) while writing Next.js hooks, reducing "type drift" and runtime errors.

---

## 2. Recommended RAG Configurations

### 2.1. Cursor / Copilot Custom Instructions
Add the following to `.cursorrules` or the project settings:
> "Always reference `docs/architecture/` before implementing new services or MCP tools. Ensure all legal analysis follows the 'Side-by-Side' paradigm defined in `website_architecture.md`. Prioritize Neo4j for relationship mapping and pgvector for semantic search."

### 2.2. Contextual Documentation
We will maintain a `MEMORY.md` (or similar) that points to the latest architectural decisions. The RAG system should prioritize these files:
1.  `docs/architecture/website_architecture.md` (System Design)
2.  `docs/architecture/mcp_agent_definitions.md` (Agent Logic)
3.  `docs/specifications/best_practices.md` (Security & UX)

---

## 3. Impact on Implementation Phases
*   **Phase 1 (Foundation):** RAG will help scaffold the monorepo structure and initial Prisma/Fastify integration.
*   **Phase 3 (AI & MCP):** This is the high-value phase for RAG, as it will manage the complex "handoff" logic between the LLM, the MCP Client, and the specialized agents.
*   **Phase 4 (Texas Use Cases):** RAG will help translate the dense legal logic in `docs/specifications/use_cases_texas.md` into functional code and graph queries.
