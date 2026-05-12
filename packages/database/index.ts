import { PrismaClient } from '@prisma/client'
import neo4j from 'neo4j-driver'

export * from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }
const globalForNeo4j = globalThis as unknown as { neo4jDriver: any }

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

const neo4jDriver = globalForNeo4j.neo4jDriver || neo4j.driver(
  process.env.NEO4J_URL || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'password'
  )
)

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = basePrisma
  globalForNeo4j.neo4jDriver = neo4jDriver
}

export { neo4jDriver }

/**
 * Tenant-aware Prisma client that enforces Row-Level Security (RLS)
 */
export const getTenantPrisma = (tenantId: string) => {
  return basePrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // Set the session variable for RLS
          await basePrisma.$executeRawUnsafe(`SET app.current_tenant_id = '${tenantId}'`)
          return query(args)
        },
      },
    },
    model: {
      documentChunk: {
        async search(queryEmbedding: number[], limit = 5) {
          const vectorString = `[${queryEmbedding.join(',')}]`
          return await basePrisma.$queryRawUnsafe<any[]>(
            `SELECT id, content, metadata, 1 - (embedding <=> '${vectorString}'::vector) as similarity
             FROM "DocumentChunk"
             ORDER BY embedding <=> '${vectorString}'::vector
             LIMIT ${limit}`
          )
        }
      }
    }
  })
}

export const prisma = basePrisma
