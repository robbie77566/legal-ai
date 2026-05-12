import { Worker, Job } from 'bullmq'
import { prisma, neo4jDriver } from '@legal-ai/database'
import Redis from 'ioredis'
import { ChunkingService } from './chunking.service'
import { EmbeddingService } from './embedding.service'
import { EntityResolutionService } from './entity-resolution.service'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

export class DocumentProcessor {
  static init() {
    const worker = new Worker(
      'document-processing',
      async (job: Job) => {
        const { documentId, tenantId, s3Key } = job.data
        const tenantPrisma = prisma // Use base prisma for internal processing if RLS allows, or getTenantPrisma

        try {
          // 1. Parsing (Mocking Docling for now)
          const parsedData = { text: 'Mock trial transcript content...' }

          // 2. Chunking
          const chunks = await ChunkingService.chunkStructuredDocument(parsedData)

          // 3. Embedding & Vector Storage
          for (const chunk of chunks) {
            const embedding = await EmbeddingService.embed(chunk.content)
            await (tenantPrisma as any).documentChunk.create({
              data: {
                documentId,
                content: chunk.content,
                metadata: chunk.metadata,
                // Handle raw vector insertion for pgvector
              }
            })
          }

          // 4. Entity Resolution & Graph Population
          const entities = await EntityResolutionService.extractEntities(parsedData.text)
          const session = neo4jDriver.session()
          try {
            for (const entity of entities) {
              const normalized = await EntityResolutionService.resolveEntity(entity)
              await session.run(
                'MERGE (e:Entity { name: $name, tenantId: $tenantId })',
                { name: normalized, tenantId }
              )
            }
          } finally {
            await session.close()
          }

          await prisma.document.update({
            where: { id: documentId },
            data: { /* status: 'COMPLETED' */ }
          })
        } catch (error) {
          console.error(`Failed to process document ${documentId}:`, error)
          throw error
        }
      },
      { 
        connection,
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1'),
      }
    )
  }
}
