#!/usr/bin/env node
/**
 * Render inventory vs the blueprint (dev_prod_switching.md §3b, 2026-09-11).
 *
 * Why: the first deploy created resources under earlier names; the blueprint
 * was then edited and re-applied, and Render created NEW resources and left
 * the old ones running (a stray Postgres, open to 0.0.0.0/0, a Key Value store,
 * a 2 GB clamav — ~$50/month, discovered ten days later). Render never deletes
 * a resource that drops out of a blueprint; it only stops managing it.
 *
 * This lists every resource in the workspace and flags anything render.yaml
 * does not declare. Run after every blueprint change.  Exit 1 on orphans.
 *
 *   pnpm render:inventory          (token: ~/.render/cli.yaml from `render login`, or RENDER_API_KEY)
 */
const fs = require('fs'); const path = require('path'); const https = require('https')
const root = path.resolve(__dirname, '..')

function token() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY
  try {
    const y = fs.readFileSync(path.join(process.env.HOME, '.render/cli.yaml'), 'utf8')
    const m = y.match(/^\s*key:\s*(\S+)/m); if (m) return m[1].replace(/^["']|["']$/g, '')
  } catch { /* fall through */ }
  console.error('No Render token: run `render login` (CLI) or set RENDER_API_KEY.'); process.exit(2)
}
const get = (p) => new Promise((res, rej) => https.get({ host: 'api.render.com', path: p, headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' } }, (r) => {
  let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => { try { res(JSON.parse(s)) } catch { rej(new Error(`${p}: ${s.slice(0, 120)}`)) } })
}).on('error', rej))

// Blueprint: declared names by kind
const yaml = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8')
const declared = new Set()
let section = null
for (const line of yaml.split('\n')) {
  if (/^databases:/.test(line)) section = 'db'; else if (/^services:/.test(line)) section = 'svc'
  const m = line.match(/^\s+(?:-\s+)?name:\s+(\S+)\s*$/); if (m && section) declared.add(m[1])
}

;(async () => {
  const [svcs, pgs, kvs] = await Promise.all([get('/v1/services?limit=100'), get('/v1/postgres?limit=100'), get('/v1/key-value?limit=100').catch(() => get('/v1/redis?limit=100')).catch(() => [])])
  const rows = []
  for (const x of svcs) { const s = x.service || x; rows.push({ kind: s.type, name: s.name, id: s.id, plan: s.serviceDetails?.plan || '', created: String(s.createdAt).slice(0, 10), extra: s.suspended === 'suspended' ? 'SUSPENDED' : '' }) }
  for (const x of pgs) { const p = x.postgres || x; const open = (p.ipAllowList || []).some((a) => a.cidrBlock === '0.0.0.0/0'); rows.push({ kind: 'postgres', name: p.name, id: p.id, plan: p.plan || '', created: String(p.createdAt).slice(0, 10), extra: open ? 'OPEN TO 0.0.0.0/0' : '' }) }
  for (const x of kvs) { const k = x.keyValue || x.redis || x; rows.push({ kind: 'key-value', name: k.name, id: k.id, plan: k.plan || '', created: String(k.createdAt).slice(0, 10), extra: '' }) }
  const orphans = rows.filter((r) => !declared.has(r.name) && !/^pgAdmin-|^pghero-/i.test(r.name))
  const missing = [...declared].filter((n) => !rows.some((r) => r.name === n))
  console.log(`Blueprint declares: ${[...declared].join(', ')}\n`)
  console.log('KIND'.padEnd(16) + 'NAME'.padEnd(20) + 'ID'.padEnd(30) + 'PLAN'.padEnd(12) + 'CREATED'.padEnd(12) + 'STATUS')
  for (const r of rows.sort((a, b) => a.name.localeCompare(b.name))) {
    const status = declared.has(r.name) ? 'in blueprint' : /^pgAdmin-|^pghero-/i.test(r.name) ? 'render add-on' : 'ORPHAN — not in render.yaml'
    console.log(String(r.kind).padEnd(16) + r.name.padEnd(20) + r.id.padEnd(30) + r.plan.padEnd(12) + r.created.padEnd(12) + status + (r.extra ? '  ' + r.extra : ''))
  }
  if (missing.length) console.log(`\n⚠ declared but absent (blueprint not applied, or renamed): ${missing.join(', ')}`)
  if (orphans.length) { console.log(`\n✗ ${orphans.length} orphan(s) — paying for resources nothing uses. Delete them in the Render dashboard (verify a Postgres is empty first).`); process.exit(1) }
  console.log('\n✓ Every Render resource is declared in render.yaml.')
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
