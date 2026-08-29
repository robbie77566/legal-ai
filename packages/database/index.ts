import { PrismaClient, Prisma } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma
export { prisma }

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

/** Executes a Prisma callback inside a transaction that activates PostgreSQL RLS for the given tenant. */
export const withTenant = async <T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
) => {
  return prisma.$transaction(async (tx) => {
    // Inject the tenant ID into the Postgres session for this specific transaction block
    // We use SET LOCAL so the setting is restricted to this transaction only
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    
    // Execute the user queries
    return fn(tx);
  });
};
