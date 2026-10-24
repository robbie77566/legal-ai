import { PrismaClient } from '@prisma/client'
import { seedAdmin } from './seed-admin'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')
  // The system tenant and the ADMIN account; ADMIN_BACKUP_EMAIL (optional,
  // seed-only) stores a verified backup email on it. See seed-admin.ts.
  await seedAdmin(prisma, process.env)
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
