#!/usr/bin/env node
/**
 * One-off cleanup (2026-09-09): six DEV test cases were uploaded into the
 * PRODUCTION case-documents bucket before the buckets were split. Their
 * objects were copied to the dev bucket the same day; this removes them
 * (every version and delete marker — the bucket is versioned) from prod.
 *
 * The prefixes are pinned here on purpose: nothing outside this list is
 * touched, whatever the bucket holds. Needs a key that can reach the prod
 * bucket (the prod user, or a Render api shell where that key is the env).
 *
 *   node scripts/purge-dev-prefixes-from-prod.cjs            # dry run: lists what would go
 *   node scripts/purge-dev-prefixes-from-prod.cjs --yes      # deletes
 */
const path = require('path')
const S = require(path.resolve(__dirname, '../apps/api/node_modules/@aws-sdk/client-s3'))
const BUCKET = 'snl-case-documents-327600375718' // PRODUCTION — deliberately not from env
const DEV_CASE_IDS = [
  'cmtfukl9400027s4llijskx6h',
  'cmtfunjd10002u733xuw8r7p0',
  'cmtfzvo5m000219djjmj3qe3i',
  'cmtipgo8y000211310k8khurj',
  'cmtipgr1m0002as1z1h4fu3ui',
  'cmtj1yrdc0002204aiz48s1r8',
]
const yes = process.argv.includes('--yes')
const c = new S.S3Client({ region: process.env.AWS_REGION || 'us-east-2' })
;(async () => {
  try { await c.send(new S.HeadBucketCommand({ Bucket: BUCKET })) } catch (e) {
    console.error(`Cannot reach ${BUCKET} with this key (${e.$metadata?.httpStatusCode || e.name}). Run with the prod key (or in a Render api shell).`); process.exit(2)
  }
  let total = 0, bytes = 0
  for (const id of DEV_CASE_IDS) {
    const Prefix = `cases/${id}/`
    const targets = []
    let KeyMarker, VersionIdMarker
    do {
      const r = await c.send(new S.ListObjectVersionsCommand({ Bucket: BUCKET, Prefix, KeyMarker, VersionIdMarker }))
      for (const v of r.Versions || []) { targets.push({ Key: v.Key, VersionId: v.VersionId }); bytes += v.Size || 0 }
      for (const d of r.DeleteMarkers || []) targets.push({ Key: d.Key, VersionId: d.VersionId })
      KeyMarker = r.IsTruncated ? r.NextKeyMarker : undefined; VersionIdMarker = r.IsTruncated ? r.NextVersionIdMarker : undefined
    } while (KeyMarker)
    total += targets.length
    console.log(`${Prefix.padEnd(36)} ${String(targets.length).padStart(4)} version(s)/marker(s)${yes ? ' — deleting' : ''}`)
    if (yes) for (let i = 0; i < targets.length; i += 1000) {
      const r = await c.send(new S.DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: targets.slice(i, i + 1000), Quiet: true } }))
      if (r.Errors?.length) { console.error('errors:', r.Errors.slice(0, 3)); process.exit(1) }
    }
  }
  console.log(`${yes ? 'Deleted' : 'Would delete'} ${total} version(s)/marker(s), ${(bytes / 1048576).toFixed(1)} MB, under ${DEV_CASE_IDS.length} dev prefixes in ${BUCKET}.`)
  if (!yes) console.log('Dry run. Re-run with --yes to delete.')
})()
