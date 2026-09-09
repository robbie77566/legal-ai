#!/usr/bin/env node
/**
 * Proves an AWS key reaches ONLY its own environment's bucket.
 *   node scripts/aws-scope-check.cjs            (uses AWS_* from the environment / root .env)
 *   node scripts/aws-scope-check.cjs prod|dev   (asserts the expected scope; exit 1 on a leak)
 * Never prints a secret — only the key id prefix and per-bucket verdicts.
 */
const path = require('path')
try { require(path.resolve(__dirname, '../apps/api/node_modules/dotenv')).config({ path: path.resolve(__dirname, '../.env') }) } catch { /* env already set */ }
const S = require(path.resolve(__dirname, '../apps/api/node_modules/@aws-sdk/client-s3'))
const ACC = '327600375718'
const BUCKETS = { prod: `snl-case-documents-${ACC}`, dev: `snl-case-documents-dev-${ACC}`, eval: `snl-eval-corpus-${ACC}` }
const expect = process.argv[2] // 'prod' | 'dev' | undefined
const c = new S.S3Client({ region: process.env.AWS_REGION || 'us-east-2' })
;(async () => {
  console.log(`key ${String(process.env.AWS_ACCESS_KEY_ID || '').slice(0, 8)}…  S3_BUCKET=${process.env.S3_BUCKET || '(unset)'}`)
  const verdict = {}
  for (const [env, b] of Object.entries(BUCKETS)) {
    try { await c.send(new S.HeadBucketCommand({ Bucket: b })); verdict[env] = 'REACHABLE' }
    catch (e) { verdict[env] = e.name === 'NotFound' ? 'not found' : `denied (${e.name})` }
    console.log(`  ${env.padEnd(5)} ${b.padEnd(42)} ${verdict[env]}`)
  }
  if (Object.values(verdict).every((v) => v.includes('CredentialsProviderError'))) {
    console.log('NO CREDENTIALS: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set in this environment.')
    process.exit(2)
  }
  if (!expect) return
  const other = expect === 'prod' ? 'dev' : 'prod'
  const ok = verdict[expect] === 'REACHABLE' && verdict[other] !== 'REACHABLE' && verdict.eval === 'REACHABLE'
  console.log(ok ? `OK: this key is scoped to ${expect} (+ eval corpus read).` : `LEAK: expected ${expect}-only; ${other} is ${verdict[other]}. Fix the user's policy.`)
  process.exit(ok ? 0 : 1)
})()
