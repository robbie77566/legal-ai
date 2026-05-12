# Cost Optimization: Hybrid Model Strategy (Gemini + Ollama)

To minimize operational costs while maintaining high reasoning quality for legal analysis, we will implement a **Hybrid Model Routing** strategy. This involves delegating specific, high-volume, or privacy-sensitive tasks to local models via **Ollama**.

## 1. Model Roles & Delegation

| Task Category | Primary Model (Gemini 1.5 Pro) | Secondary Model (Ollama / Llama 3) | Rationale |
| :--- | :--- | :--- | :--- |
| **Final Legal Analysis** | **Primary** | - | Requires the highest reasoning capability and large context window for Article 11.07 writs. |
| **Document Pre-processing** | - | **Primary** | Tasks like cleaning OCR text, identifying document types, and extracting basic metadata can be done locally to save tokens. |
| **Initial IAC/Brady Flagging** | - | **Primary** | Ollama can perform a 'first pass' to find potential keywords or inconsistencies, which are then passed to Gemini for final validation. |
| **Zero-Retention Processing** | - | **Primary** | For the highest privacy tier, processing data locally via Ollama ensures that sensitive document text never leaves the local environment. |
| **Drafting Standard Forms** | - | **Primary** | Generating boilerplate legal forms or initial 'Statement of Facts' based on extracted data. |
| **Summarization** | **Secondary** | **Primary** | Summarizing long trial days or witness testimonies to fit within smaller context windows for intermediate steps. |

---

## 2. Updated Architecture Flow

The **BullMQ Worker** and **Smart Chat Orchestrator** will now include a `ModelRouter` component:

```mermaid
graph TD
    Task[New Analysis Task] --> Router{Model Router}
    Router -->|High Reasoning / Final Writ| Gemini[Gemini 1.5 Pro (Cloud)]
    Router -->|Preprocessing / Privacy / Bulk| Ollama[Ollama (Local/Edge)]
    
    Ollama -->|Refined Context| Gemini
    Gemini -->|Final Report| User
```

---

## 3. Implementation Details

### 3.1. Ollama Integration in Fastify
We will use the standard Ollama API (running on a dedicated GPU-enabled instance or the local developer machine) as a service in the backend.

```typescript
// Example Model Router Logic
async function processDocument(content: string, priority: 'high' | 'low') {
  if (priority === 'low') {
    // High-volume, low-cost pre-processing
    return await ollama.generate({
      model: 'llama3:8b',
      prompt: `Clean and structure this legal transcript: ${content}`
    });
  } else {
    // High-reasoning final analysis
    return await gemini.generateReport(content);
  }
}
```

### 3.2. Local MCP Servers
Some MCP servers (like `mcp-filesystem` or `mcp-tx-statutes`) can be run locally alongside Ollama, allowing for a fully local "Research Sandbox" that costs zero tokens until the final synthesis phase.

---

## 4. Cost Impact Analysis
*   **Token Savings:** By offloading 70% of pre-processing and initial "flagging" to Ollama, we estimate a **50-60% reduction in API costs** during the heavy ingestion phase (Phase 2).
*   **Performance:** Local processing reduces latency for simple tasks and eliminates "Token Limit" anxiety during initial document exploration.
*   **Privacy:** Provides a "Local-Only" tier for law firms with strict data sovereignty requirements.
