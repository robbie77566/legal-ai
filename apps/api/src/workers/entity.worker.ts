import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { getSession } from '../services/neo4j';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

export const entityWorker = new Worker('graph', async (job: Job) => {
  const { documentId, chunks } = job.data;
  const session = getSession();
  
  try {
    for (const chunk of chunks) {
      // Mock LLM entity extraction (Normally done via Llama 3)
      let entities = [];
      if (chunk.text.includes('Detective Smith')) {
        entities.push({ name: 'Detective Smith', type: 'Person' });
      }
      if (chunk.text.includes('1998')) {
        entities.push({ name: '1998 Concussion', type: 'MedicalEvent' });
      }
      
      for (const entity of entities) {
        // Use MERGE to ensure idempotency (Entity Resolution)
        // If "Detective Smith" already exists, it maps the new document to him
        await session.run(`
          MERGE (e:Entity {name: $name})
          ON CREATE SET e.type = $type
          MERGE (d:Document {id: $documentId})
          MERGE (e)-[:MENTIONED_IN]->(d)
        `, {
          name: entity.name,
          type: entity.type,
          documentId
        });
      }
    }
  } finally {
    await session.close();
  }

  return { success: true };
}, { connection });
