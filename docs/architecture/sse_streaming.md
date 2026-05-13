# Real-Time Streaming Architecture (SSE)

This document explains the architecture behind the real-time processing feedback mechanisms in the HabeasGraph Litigation Triage application.

## The Challenge

Processing unstructured legal data (PDFs, Axon MP4s, Court Transcripts) via LangGraph AI agents is computationally intensive and takes considerable time. Without real-time feedback, the UI appears frozen, leading to poor user experience. 

## The Solution: Server-Sent Events (SSE) & Redis

We implemented a unidirectional, real-time streaming architecture using Server-Sent Events (SSE) backed by a Redis Pub/Sub messaging layer.

### Why SSE over WebSockets?
While WebSockets offer full bi-directional communication, our use-case is strictly unidirectional: the background workers need to stream logs *down* to the client. SSE is lightweight, native to the browser (`EventSource`), automatically handles reconnections, and operates smoothly over standard HTTP/HTTPS without requiring complex proxy configurations.

## Architecture Flow

The architecture operates across three distinct layers: the Background Worker, the Fastify API, and the Next.js Frontend.

### 1. The Worker Layer (Publisher)
When the `ingestionWorker` or `entityWorker` processes data, it publishes its status and execution logs to a Redis channel unique to the case.

```typescript
// Inside worker
import { connection } from '../services/queue'; // IORedis connection

await connection.publish(
  `case-progress:${caseId}`, 
  JSON.stringify({ message: "Extracting vectors...", status: "processing", source: "entity" })
);

// Upon completion
await connection.publish(
  `case-progress:${caseId}`, 
  JSON.stringify({ message: "Done.", status: "complete", source: "system" })
);
```

### 2. The Fastify API (Broker)
The API exposes a dedicated streaming endpoint (`GET /cases/:id/progress`). When a client hits this endpoint:
1. The server sets standard SSE headers (`Content-Type: text/event-stream`, `Connection: keep-alive`).
2. The server spawns a dedicated Redis subscriber and subscribes to `case-progress:${id}`.
3. As messages arrive on the channel, the server writes them directly into the raw HTTP stream.
4. If the client disconnects, the server gracefully unsubscribes and quits the Redis connection to prevent memory leaks.

```typescript
// Inside fastify route
fastify.get('/:id/progress', async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.flushHeaders();

  const subscriber = new IORedis(process.env.REDIS_URL);
  await subscriber.subscribe(`case-progress:${id}`);
  
  subscriber.on('message', (ch, message) => {
    reply.raw.write(`data: ${message}\n\n`);
  });
});
```

### 3. The Frontend Client (Subscriber)
The Next.js `DashboardPage.tsx` establishes the connection immediately after the case and file uploads are initialized.

```javascript
const eventSource = new EventSource(`http://localhost:3001/cases/${generatedCaseId}/progress`);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setProcessingLogs((prevLogs) => [...prevLogs, data]);

  if (data.status === "complete") {
    eventSource.close();
    router.push(`/workspace/${generatedCaseId}`); // Auto-redirect
  }
};
```

## How to View the SSE Stream in the UI

To see the SSE viewer in action within the application:
1. Navigate to the **Litigation Triage Dashboard** (`/dashboard`).
2. Drag and drop any supported file (e.g., a PDF docket, transcript, or an empty test `.zip` file) into the "Drop Files to Auto-Generate Case" dropzone.
3. A "Setup New Case" modal will appear. Enter a case name and click **"Save & Analyze"**.
4. The dropzone will immediately transform into the **Real-time Stream Viewer**. 
5. You will see a dark terminal-like window displaying logs (e.g., `[entity] Extracting vectors...`) streaming live from the backend as the LangGraph agents analyze the files. Once the process completes, the stream will close and auto-redirect you to the Workspace.

## Summary
By leveraging Redis Pub/Sub to decouple the background workers from the API, and utilizing standard SSE for the client connection, we achieved highly scalable, lightweight, and resilient real-time streaming that actively informs the user of AI processing state.
