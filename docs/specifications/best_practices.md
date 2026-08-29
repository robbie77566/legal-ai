# Best Practices for HabeasGraph

## 1. Data Security & Sovereignty
*   **Encryption at Rest & Transit:** Use AES-256 for storage and TLS 1.3 for data in motion.
*   **Zero-Retention Processing:** Offer an "Incognito Analysis" mode where document text is never saved to a database, only processed in-memory for the session. *(Professional-tier feature only — the consumer product requires stored chunks for QA citation re-verification and operates the 12-month retention/deletion policy instead: `mvp_v1_prd.md` NFR-3.)*
*   **SOC2/HIPAA Alignment:** Even if not certified yet, follow the architectural patterns (audit logs, IAM roles, data isolation).

## 2. Accuracy & Hallucination Mitigation
*   **Grounded Citations:** Every claim made by the AI **must** be accompanied by a link to the source document (Page/Line) or a verified statute/case.
*   **Human-in-the-loop (HITL):** The AI should "propose" findings rather than "declaring" them. Use UI components that allow lawyers to verify, edit, or reject AI suggestions.
*   **Model Routing:** Cheap models transform (OCR cleanup, chunking, entity candidates); only high-reasoning frontier models (e.g., Claude Opus 5 / Sonnet 5, current Gemini Pro) filter — i.e., decide what counts as a finding. Never place a small model where its misses are unrecoverable. See `docs/architecture/cost_optimization_ollama.md` for the three-tier routing and `docs/architecture/model_evaluation.md` for how model choices are validated (recall-first, ground-truth anchored).

## 3. UI/UX for Legal Professionals
*   **The "Side-by-Side" Paradigm:** Do not hide the source text. Keep the transcript visible next to the analysis.
*   **Density over Beauty:** Legal professionals prefer information density. Use clear typography, distinct headers, and collapsible sections rather than excessive whitespace.
*   **Progressive Disclosure:** Show the summary first, but allow "drill-down" into the specific reasoning and source quotes.

## 4. Performance & Scalability
*   **Async Processing:** Use background workers (BullMQ/Celery) for OCR and AI analysis. Provide a real-time progress bar to the user.
*   **Streaming Responses:** Use Server-Sent Events (SSE) or WebSockets to stream AI analysis as it's being generated, rather than waiting for the entire report to finish.

## 5. Compliance & Ethics
*   **AI Disclosure:** Clearly label all AI-generated content.
*   **No Legal Advice:** Include persistent disclaimers that the tool is an assistant for legal professionals and does not constitute formal legal advice.
