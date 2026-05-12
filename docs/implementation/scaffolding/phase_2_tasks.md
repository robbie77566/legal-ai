# Phase 2: Ingestion & Knowledge Graph - Detailed Task List

## 1. High-Fidelity Document Pipeline

### Task 2.1: BullMQ Worker & Storage Scaffolding
- [x] Implement the `DocumentProcessor` worker in `apps/api`.
- [x] **Storage Enhancement:** Setup **S3 Pre-signed URL** flow for transcript uploads to handle large files.
- [x] **Infrastructure Enhancement:** Configure BullMQ to run resource-heavy jobs (Docling/Ollama) on **GPU-enabled worker instances** separate from the API.
- [x] Setup error handling and retry logic for parsing jobs.
- [x] **Documentation:** `docs/pipeline/worker_architecture.md` mapping the state transitions of a document.
- [x] **Test Case:** Upload a document; verify BullMQ receives the job and updates the DB status to PARSING.

### Task 2.2: Docling Integration
- [x] Integrate **Docling** (or a similar high-fidelity parser) into the worker.
- [x] Ensure the parser extracts structural elements: Headers, Tables, and Footnotes.
- [x] Map the output to a standardized `ParsedDocument` JSON schema.
- [x] **Documentation:** `docs/pipeline/parsing_strategy.md` detailing how complex trial transcript layouts are handled.
- [x] **Test Case:** Process a sample trial transcript; verify that the extracted JSON contains distinct header levels and table data.

---

## 2. Vector Storage & Semantic Search

### Task 2.3: Hierarchical Chunking Logic
- [x] Implement a chunking service that respects document boundaries (Headers).
- [x] **Metadata Injection:** Every chunk must include `pageNumber`, `lineStart`, `lineEnd`, and `parentHeader`.
- [x] Implement overlapping sliding windows to preserve context across chunks.
- [x] **Documentation:** `docs/pipeline/chunking_specification.md` defining the token limits and overlap strategy.
- [x] **Test Case:** Chunk a 10-page document; verify that the 50th chunk still retains the correct `parentHeader` metadata.

### Task 2.4: pgvector HNSW Search
- [x] Implement the embedding service (using Gemini or local Ollama embeddings).
- [x] Create a `search_documents` function in PostgreSQL/Prisma using **HNSW indexing** for speed.
- [x] Implement **Metadata Filtering** (e.g., search only within "Witness X" testimony).
- [x] **Documentation:** `docs/search/semantic_search_api.md` detailing the RAG retrieval parameters.
- [x] **Test Case:** Perform a semantic query; verify the results are sorted by cosine similarity and include all required metadata.

---

## 3. Knowledge Graph & Entity Resolution

### Task 2.5: Neo4j Legal Schema Implementation
- [x] Implement the base schema: `(Witness)`, `(Evidence)`, `(Charge)`, `(Document)`, `(Testimony)`.
- [x] Define relationship types: `[:TESTIFIED_ABOUT]`, `[:MENTIONED_IN]`, `[:SUPPORTS]`.
- [x] Setup the Neo4j client in `packages/database`.
- [x] **Documentation:** `docs/database/neo4j_schema.md` with a visual graph of the legal entity relationships.
- [x] **Test Case:** Manually create a relationship; verify it is queryable via Cypher.

### Task 2.6: Ollama-Powered Entity Resolution
- [x] Create an "Entity Extractor" worker that uses local **Ollama (Llama 3)** to identify names and objects from parsed text.
- [x] Implement the **Resolution Logic:** Compare extracted entities against existing Neo4j nodes (e.g., "Officer Smith" vs "John Smith").
- [x] Implement a "Confidence Threshold" for auto-merging vs manual review.
- [x] **Documentation:** `docs/ai/entity_resolution_logic.md` detailing the normalization prompts and matching algorithms.
- [x] **Test Case (Critical):** Ingest two different transcript segments mentioning the same witness with slightly different names; verify Neo4j creates a single `Witness` node with aliases.

---

## 4. Orchestration & Finalization

### Task 2.7: Ingestion Orchestrator
- [x] Build the master orchestrator that sequences: Parse -> Chunk -> Embed -> Resolve Entities -> Populate Graph.
- [x] Implement "Progress Tracking" for the UI (e.g., "Step 3/5: Resolving Witnesses...").
- [x] **Documentation:** `docs/pipeline/ingestion_flow.md` providing a sequence diagram of the entire process.
- [x] **Test Case:** Run the full pipeline on a multi-document trial set; verify all vector chunks and graph nodes are correctly cross-referenced.

---

## Phase 2 Verification Milestone
- [x] A 100-page trial transcript is fully ingested in under 5 minutes.
- [x] Semantic search returns specific page/line citations.
- [x] The Knowledge Graph correctly links a `Witness` to the `Evidence` they testified about, across multiple document files.
- [x] All entities are normalized, preventing duplicate nodes for the same person/object.
