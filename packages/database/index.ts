import { PrismaClient, Prisma } from '@prisma/client'

/**
 * Two connections, two roles (system design §10.3, implementation plan M0):
 *
 *  - `prisma` (owner/admin): migrations, auth bootstrap (user lookup by email
 *    at sign-in happens before any tenant context exists), and explicitly
 *    cross-tenant admin operations. In dev/CI this is the compose superuser —
 *    RLS does NOT apply on this connection; never use it for tenant data.
 *
 *  - `withTenant` (hg_app): the ONLY sanctioned path for tenant-scoped
 *    queries. It runs on the non-superuser `hg_app` role (created by the RLS
 *    migration), so the tenant-isolation policies — including WITH CHECK on
 *    writes — are actually enforced by Postgres, not just by query filters.
 *
 * APP_DATABASE_URL overrides the hg_app connection string; when unset it is
 * derived from DATABASE_URL by swapping in the hg_app credentials
 * (HG_APP_PASSWORD, defaulting to the dev/CI password from the migration —
 * production MUST set both).
 */

const prismaClientSingleton = () => {
  return new PrismaClient()
}

const appUrl = () => {
  if (process.env.APP_DATABASE_URL) return process.env.APP_DATABASE_URL
  const base =
    process.env.DATABASE_URL ??
    'postgresql://user:password@localhost:5433/legal_ai?schema=public'
  const u = new URL(base)
  u.username = 'hg_app'
  u.password = process.env.HG_APP_PASSWORD ?? 'hg_app_dev_password'
  return u.toString()
}

const appPrismaClientSingleton = () => {
  return new PrismaClient({ datasources: { db: { url: appUrl() } } })
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
  var appPrismaGlobal: undefined | ReturnType<typeof appPrismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()
const appPrisma = globalThis.appPrismaGlobal ?? appPrismaClientSingleton()

export default prisma
export { prisma, appPrisma }
export * from './events'

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
  globalThis.appPrismaGlobal = appPrisma
}

/**
 * Executes a Prisma callback inside a transaction that activates PostgreSQL
 * RLS for the given tenant — on the non-superuser `hg_app` connection, so the
 * policies are genuinely enforced.
 */
export const withTenant = async <T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
) => {
  return appPrisma.$transaction(async (tx) => {
    // SET LOCAL via set_config(..., true): scoped to this transaction only
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

    return fn(tx);
  });
};
