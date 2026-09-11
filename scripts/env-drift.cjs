#!/usr/bin/env node
/**
 * Config drift check (dev_prod_switching.md). Every prod failure in Sept 2026
 * was configuration, not code — this makes drift visible before it bites.
 *
 *   node scripts/env-drift.cjs           # CI mode: blueprint ↔ docs ↔ .env.example must agree (exit 1 otherwise)
 *   node scripts/env-drift.cjs --local   # also: what the api blueprint expects vs this box's .env / .env.prod
 */
const fs = require('fs'); const path = require('path')
const root = path.resolve(__dirname, '..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8')
const local = process.argv.includes('--local')

// Blueprint: key → { service, kind } (kind: value | fromDatabase | fromService | secret)
const blueprint = {}
let service = null
for (const line of read('render.yaml').split('\n')) {
  const sv = line.match(/^\s+name:\s+(\S+)\s*$/); if (sv && /^\s{4}name:/.test(line)) service = sv[1]
  const inline = line.match(/-\s*\{\s*key:\s*([A-Z0-9_]+)\s*,\s*(sync:\s*false|value:)/)
  const block = line.match(/^\s+-\s+key:\s+([A-Z0-9_]+)\s*$/)
  if (inline) blueprint[`${service}:${inline[1]}`] = { service, key: inline[1], kind: inline[2].startsWith('sync') ? 'secret' : 'value' }
  else if (block) blueprint[`${service}:${block[1]}`] = { service, key: block[1], kind: 'pending' }
  else if (service && /^\s+(fromDatabase|fromService|value):/.test(line)) {
    const last = Object.values(blueprint).filter((b) => b.kind === 'pending').pop(); if (last) last.kind = line.trim().split(':')[0]
  }
}
const declared = [...new Set(Object.values(blueprint).map((b) => b.key))]

// Docs: every backticked var in the reference (first column, or slash-joined groups)
const documented = new Set()
for (const m of read('docs/operations/environment_reference.md').matchAll(/`([A-Z][A-Z0-9_*/ ]+)`/g)) {
  const parts = m[1].split(/\s*\/\s*/).map((k) => k.replace(/\*$/, '').trim())
  for (const k of parts) documented.add(k)
  // "MODEL_USD_PER_MTOK_IN/OUT" — a bare suffix after the slash replaces the last segment
  if (parts.length > 1 && !parts[1].includes('_')) documented.add(parts[0].replace(/_[A-Z0-9]+$/, `_${parts[1]}`))
}
const exampleKeys = new Set([...read('.env.example').matchAll(/^\s*([A-Z0-9_]+)\s*=/gm)].map((m) => m[1]))

let bad = 0
const undocumented = declared.filter((k) => ![...documented].some((d) => d === k || (d.includes('*') && k.startsWith(d.replace(/\*.*$/, '')))))
if (undocumented.length) { bad++; console.log(`✗ Declared in render.yaml but not in environment_reference.md: ${undocumented.join(', ')}`) }
const nonSecretApi = Object.values(blueprint).filter((b) => b.service === 'api' && b.kind === 'value').map((b) => b.key)
const RENDER_ONLY = new Set(['NODE_ENV', 'NODE_OPTIONS', 'WEB_ORIGIN', 'CLAMD_HOST', 'SENTRY_DSN'])
const missingExample = nonSecretApi.filter((k) => !exampleKeys.has(k) && !RENDER_ONLY.has(k))
if (missingExample.length) { bad++; console.log(`✗ Non-secret api values in render.yaml missing from .env.example: ${missingExample.join(', ')}`) }
if (!bad) console.log(`✓ Blueprint (${declared.length} vars), environment_reference.md, and .env.example agree.`)

if (local) {
  const parse = (f) => { try { return new Set([...read(f).matchAll(/^\s*([A-Z0-9_]+)\s*=\s*\S/gm)].map((m) => m[1])) } catch { return null } }
  const dev = parse('.env'); const prod = parse('.env.prod')
  console.log('\n— This box —')
  if (!dev) console.log('  no .env')
  else {
    const apiKeys = Object.values(blueprint).filter((b) => b.service === 'api' && b.kind !== 'fromDatabase' && b.kind !== 'fromService').map((b) => b.key)
    // Absent in dev BY DESIGN — each has a dev behaviour that does not need the value.
    const PROD_ONLY = new Set([
      'NODE_ENV', 'WEB_ORIGIN', 'SENTRY_DSN', 'POSTHOG_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'EVAL_CORPUS_BUCKET',
      'RESEND_API_KEY',   // dev = console transport, prints the email body
      'HG_APP_PASSWORD',  // dev = the migration's default role password
    ])
    const missing = apiKeys.filter((k) => !dev.has(k) && !PROD_ONLY.has(k))
    console.log(missing.length ? `  .env is missing api values the blueprint sets/expects: ${missing.join(', ')}` : '  .env covers every api value the blueprint expects (prod-only ones excepted).')
    const prodPaths = ['CLAMD_HOST', 'ANALYSIS_BATCH', 'NODE_OPTIONS', 'INGESTION_CONCURRENCY', 'ANALYSIS_CONCURRENCY'].filter((k) => !dev.has(k))
    if (prodPaths.length) console.log(`  prod-only code paths NOT exercised in dev (unset here): ${prodPaths.join(', ')}  → see dev_prod_switching.md §1`)
    if (dev.has('S3_BUCKET') && /"?snl-case-documents-3/.test(read('.env'))) { console.log('  ✗ .env S3_BUCKET is the PRODUCTION bucket'); bad++ }
  }
  console.log(prod ? `  .env.prod present (${[...prod].join(', ')}) — production inspection enabled` : '  no .env.prod — production inspection disabled (copy .env.prod.example)')
}
process.exit(bad ? 1 : 0)
