import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const systemTenantName = process.env.SYSTEM_TENANT_NAME || 'System Admin'
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@legalai.local'
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme-before-production'

  if (adminPassword === 'changeme-before-production') {
    console.warn('WARNING: Using default admin password. Set ADMIN_PASSWORD in .env before deploying.')
  }

  console.log('Seeding database...')

  const passwordHash = await bcrypt.hash(adminPassword, 12)

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
    update: { passwordHash },
    create: {
      email: adminEmail,
      name: 'System Administrator',
      passwordHash,
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
