#!/usr/bin/env node
/**
 * Eval gate step summary (persona_rollout_plan.md §5 J, §7, §8): turns the
 * api's `GET /ops/eval/runs` JSON into the Markdown the GitHub workflow
 * writes to $GITHUB_STEP_SUMMARY, and says whether the gate is red.
 *
 *   node scripts/eval-gate-summary.cjs eval-gate.json [--ids id1,id2] [--no-fail]
 *
 * Prints the Markdown to stdout. Exits 1 when any selected run is not a
 * SCORED pass (a FAILED run, a run still queued or running at the deadline,
 * or a red scorecard) unless --no-fail is given. Pure: no network, no env.
 */
const fs = require('fs')

const BUCKETS = ['SHORT', 'STANDARD', 'EXTENDED', 'LONG']
const usd = (cents) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`)
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
const when = (iso) => (iso ? String(iso).replace('T', ' ').slice(0, 16) + ' UTC' : '—')

function verdictOf(run) {
  if (run.status === 'SCORED') return run.pass === true ? 'PASS' : 'FAIL'
  if (run.status === 'FAILED') return 'ERROR'
  return `INCOMPLETE (${run.status})`
}

/**
 * @param {{ runs: any[], costPerBucket?: Record<string, any>, ledgers?: any[] }} listing
 * @param {{ runIds?: string[] }} [opts]
 */
function summarize(listing, opts = {}) {
  const all = Array.isArray(listing && listing.runs) ? listing.runs : []
  const wanted = opts.runIds && opts.runIds.length ? new Set(opts.runIds) : null
  const runs = wanted ? all.filter((r) => wanted.has(r.id)) : all
  const missingIds = wanted ? [...wanted].filter((id) => !all.some((r) => r.id === id)) : []

  const rows = runs.map((r) => {
    const s = r.summary || null
    return {
      id: r.id,
      ledger: r.ledger,
      verdict: verdictOf(r),
      pass: r.status === 'SCORED' && r.pass === true,
      mustFind: s ? `${s.found}/${s.mustFindTotal} (${pct(s.recall)})` : '—',
      missed: s && Array.isArray(s.missed) ? s.missed : [],
      dropped: s ? pct(s.droppedAtVerification) : '—',
      bucket: r.bucket || '—',
      cost: usd(r.costCents),
      margin: s && s.margin != null ? pct(s.margin) : '—',
      engine: s && s.model ? `${s.model} · ${s.promptSet || '—'} ${s.promptHash || ''}`.trim() : '—',
      startedAt: when(r.startedAt),
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
      error: r.error || null,
    }
  })
  const failed = rows.some((r) => !r.pass) || missingIds.length > 0 || rows.length === 0
  const counts = { total: rows.length, pass: rows.filter((r) => r.pass).length, fail: rows.filter((r) => !r.pass).length }

  const lines = []
  lines.push(failed ? '## Eval gate: RED' : '## Eval gate: GREEN')
  lines.push('')
  if (rows.length === 0) lines.push('No eval runs were found for this gate run.')
  else lines.push(`${counts.pass} of ${counts.total} ledger run(s) passed. A red gate blocks promotion (persona_rollout_plan.md §7).`)
  if (missingIds.length) lines.push(`Runs never reported by the api: ${missingIds.join(', ')}.`)
  lines.push('')
  lines.push('| Ledger | Verdict | Must-find | Dropped at verification | Bucket | Cost | Margin | Engine | Started |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const r of rows) {
    lines.push(`| ${r.ledger} | ${r.pass ? '🟢' : '🔴'} ${r.verdict} | ${r.mustFind} | ${r.dropped} | ${r.bucket} | ${r.cost} | ${r.margin} | ${r.engine} | ${r.startedAt} |`)
  }
  const problems = rows.filter((r) => !r.pass)
  if (problems.length) {
    lines.push('')
    lines.push('### Why')
    for (const r of problems) {
      if (r.error) lines.push(`- **${r.ledger}** — ${r.verdict}: ${r.error}`)
      else if (r.reasons.length) for (const reason of r.reasons) lines.push(`- **${r.ledger}** — ${reason}`)
      else lines.push(`- **${r.ledger}** — ${r.verdict}`)
    }
  }
  const cpb = listing && listing.costPerBucket
  if (cpb) {
    lines.push('')
    lines.push('### Cost per record bucket (all scored runs the api listed)')
    lines.push('')
    lines.push('| Bucket | Runs | Mean cost | Total | Unpriced |')
    lines.push('|---|---|---|---|---|')
    for (const b of BUCKETS) {
      const c = cpb[b] || { n: 0, meanCents: null, totalCents: 0, unpriced: 0 }
      lines.push(`| ${b} | ${c.n} | ${usd(c.meanCents)} | ${usd(c.totalCents)} | ${c.unpriced} |`)
    }
  }
  lines.push('')
  return { rows, markdown: lines.join('\n'), failed, counts, missingIds }
}

function main(argv) {
  const args = argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('usage: eval-gate-summary.cjs <eval-gate.json> [--ids id1,id2] [--no-fail]')
    return 2
  }
  const idsIdx = args.indexOf('--ids')
  const runIds = idsIdx >= 0 && args[idsIdx + 1] ? args[idsIdx + 1].split(',').map((s) => s.trim()).filter(Boolean) : []
  const listing = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = summarize(listing, { runIds })
  process.stdout.write(out.markdown)
  return out.failed && !args.includes('--no-fail') ? 1 : 0
}

module.exports = { summarize, verdictOf }
if (require.main === module) process.exit(main(process.argv))
