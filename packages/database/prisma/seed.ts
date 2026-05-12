import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const systemTenantName = process.env.SYSTEM_TENANT_NAME || 'System Admin'
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@legalai.local'

  console.log('Seeding database...')

  // Create initial tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: 'system-tenant' },
    update: {},
    create: {
      id: 'system-tenant',
      name: systemTenantName,
    },
  })

  // Create initial admin user
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      name: 'System Administrator',
      tenantId: tenant.id,
    },
  })

  console.log('Seed completed.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
