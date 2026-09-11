#!/usr/bin/env node
/**
 * Read-only case inspection against dev OR production (dev_prod_switching.md).
 *
 *   pnpm prod:case <email | caseId>                 # production (.env.prod → PROD_DATABASE_URL)
 *   pnpm prod:case <email | caseId> --env dev       # the local dev database (.env → DATABASE_URL)
 *   … --events 100                                   # more timeline rows (default 30)
 *
 * Prints the account, every case with its documents (read or not), analysis
 * runs with checks finished and findings, payments, and the newest events.
 * Against production it REFUSES any role other than hg_readonly unless
 * --allow-owner is given, so a debugging session cannot write by accident.
 */
const path = require('path')
const fs = require('fs')
const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? true : d }
const target = args[0]
if (!target || target.startsWith('--')) { console.error('usage: prod-case <email|caseId> [--env prod|dev] [--events N] [--allow-owner]'); process.exit(2) }
const env = flag('--env', 'prod')
const eventsN = Number(flag('--events', 30))

function loadEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
let url
if (env === 'prod') {
  url = process.env.PROD_DATABASE_URL || loadEnvFile(path.join(root, '.env.prod')).PROD_DATABASE_URL
  if (!url) { console.error('No PROD_DATABASE_URL — create .env.prod from .env.prod.example (docs/operations/dev_prod_switching.md).'); process.exit(2) }
  const user = new URL(url).username
  if (user !== 'hg_readonly' && !args.includes('--allow-owner')) {
    console.error(`Refusing: production URL user is "${user}", not hg_readonly. Create the read-only role (docs/operations/sql/readonly_role.sql) or pass --allow-owner knowingly.`); process.exit(2)
  }
} else {
  url = process.env.DATABASE_URL || loadEnvFile(path.join(root, '.env')).DATABASE_URL
}
const { PrismaClient } = require(path.join(root, 'packages/database/node_modules/@prisma/client'))
const prisma = new PrismaClient({ datasources: { db: { url } } })
const when = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) : '—')
const ago = (d) => { if (!d) return ''; const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

;(async () => {
  console.log(`[${env.toUpperCase()}] ${new URL(url).host}  as ${new URL(url).username}\n`)
  let users = []
  let caseIds = []
  if (target.includes('@')) {
    users = await prisma.user.findMany({ where: { email: { equals: target, mode: 'insensitive' } }, select: { id: true, email: true, name: true, role: true, createdAt: true, deletedAt: true, passwordChangedAt: true } })
    if (!users.length) { console.log('No account with that email.'); return }
    const access = await prisma.caseAccess.findMany({ where: { userId: { in: users.map((u) => u.id) } }, select: { caseId: true } })
    caseIds = access.map((a) => a.caseId)
  } else {
    caseIds = [target]
    const access = await prisma.caseAccess.findMany({ where: { caseId: target }, select: { userId: true } })
    users = await prisma.user.findMany({ where: { id: { in: access.map((a) => a.userId) } }, select: { id: true, email: true, name: true, role: true, createdAt: true, deletedAt: true, passwordChangedAt: true } })
  }
  for (const u of users) console.log(`ACCOUNT  ${u.email}  ${u.role}  name=${u.name ?? '—'}  since ${when(u.createdAt)}${u.deletedAt ? '  DELETED' : ''}`)
  const cases = await prisma.case.findMany({ where: { id: { in: caseIds } }, orderBy: { createdAt: 'desc' } })
  if (!cases.length) { console.log('\nNo cases.'); return }
  for (const c of cases) {
    console.log(`\n══ CASE ${c.id}  ${c.title}`)
    console.log(`   status ${c.status}  lane ${c.lane ?? '—'}  created ${when(c.createdAt)}  updated ${when(c.updatedAt)} (${ago(c.updatedAt)})`)
    console.log(`   slaStartedAt ${when(c.slaStartedAt)}  expectedReadyAt ${when(c.expectedReadyAt)}  ocrHalt=${c.ocrHalt} delayOurs=${c.delayOurs}`)
    const docs = await prisma.document.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'asc' }, select: { id: true, filename: true, s3Key: true, quarantined: true, createdAt: true, _count: { select: { pages: true } } } })
    console.log(`   DOCUMENTS ${docs.length}`)
    for (const d of docs) console.log(`     ${d.quarantined ? 'QUARANTINED' : d._count.pages > 0 ? `READ ${String(d._count.pages).padStart(4)} pages` : 'NOT READ YET     '}  ${d.filename}  ${when(d.createdAt)}${d.s3Key ? '' : '  (no s3Key!)'}`)
    const runs = await prisma.analysisRun.findMany({ where: { caseId: c.id }, orderBy: { startedAt: 'asc' }, select: { id: true, runNo: true, startedAt: true, completedAt: true } })
    console.log(`   ANALYSIS RUNS ${runs.length}`)
    for (const r of runs) {
      const screens = await prisma.caseEvent.findMany({ where: { caseId: c.id, type: 'screen.completed', createdAt: { gte: r.startedAt } }, select: { payload: true } })
      const done = [...new Set(screens.map((e) => e.payload?.screen).filter(Boolean))]
      const findings = await prisma.finding.count({ where: { runId: r.id } })
      console.log(`     run ${r.runNo}  started ${when(r.startedAt)}  ${r.completedAt ? `finished ${when(r.completedAt)}` : 'NOT FINISHED'}  checks ${done.length} [${done.join(', ')}]  findings ${findings}`)
    }
    const pays = await prisma.payment.findMany({ where: { caseId: c.id }, select: { kind: true, status: true, amountCents: true, promoCode: true, createdAt: true } })
    if (pays.length) console.log(`   PAYMENTS ` + pays.map((p) => `${p.kind} ${p.status} $${(p.amountCents / 100).toFixed(2)}${p.promoCode ? ` (${p.promoCode})` : ''} ${when(p.createdAt)}`).join(' | '))
    const events = await prisma.caseEvent.findMany({ where: { caseId: c.id }, orderBy: { createdAt: 'desc' }, take: eventsN, select: { type: true, actor: true, createdAt: true, payload: true } })
    console.log(`   EVENTS (newest ${events.length}${events.length ? `, newest ${ago(events[0].createdAt)}` : ''})`)
    for (const e of events) {
      const p = e.payload && typeof e.payload === 'object' ? JSON.stringify(e.payload) : ''
      console.log(`     ${when(e.createdAt)}  ${e.type.padEnd(24)} ${String(e.actor).slice(0, 12).padEnd(12)} ${p.length > 90 ? p.slice(0, 87) + '…' : p}`)
    }
  }
  await prisma.$disconnect()
})().catch(async (e) => { console.error('FAILED:', e.message.trim().split('\n').slice(0, 3).join(' ')); await prisma.$disconnect().catch(() => {}); process.exit(1) })
