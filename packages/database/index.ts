import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

/**
 * Executes a Prisma query within an interactive transaction that has the 
 * PostgreSQL session variable `app.current_tenant_id` securely set.
 * This is required to bypass Row-Level Security (RLS) and access data.
 * 
 * @param tenantId The ID of the current tenant session
 * @param fn The transaction callback containing the queries
 */
export const withTenant = async <T>(
  tenantId: string,
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
) => {
  return prisma.$transaction(async (tx) => {
    // Inject the tenant ID into the Postgres session for this specific transaction block
    // We use SET LOCAL so the setting is restricted to this transaction only
    await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}';`);
    
    // Execute the user queries
    return fn(tx);
  });
};
