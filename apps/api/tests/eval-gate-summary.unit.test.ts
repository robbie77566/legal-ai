/**
 * J8 — the eval gate's CI half: the workflow YAML parses and wires the
 * schedule, the dispatch input, the secret skip and the fail step; and
 * scripts/eval-gate-summary.cjs turns the api's JSON into the Markdown
 * step summary with the right verdict.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { parse as parseYaml } from 'yaml';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { summarize, verdictOf } = require('../../../scripts/eval-gate-summary.cjs') as {
  summarize: (listing: unknown, opts?: { runIds?: string[] }) => { rows: Array<{ id: string; ledger: string; verdict: string; pass: boolean; mustFind: string; dropped: string; bucket: string; cost: string }>; markdown: string; failed: boolean; counts: { total: number; pass: number; fail: number }; missingIds: string[] };
  verdictOf: (run: { status: string; pass: boolean | null }) => string;
};

const ROOT = path.resolve(__dirname, '../../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/eval-gate.yml');
const SCRIPT = path.join(ROOT, 'scripts/eval-gate-summary.cjs');
const FIXTURE = path.join(__dirname, 'fixtures/eval-gate.json');
const listing = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));

describe('.github/workflows/eval-gate.yml (J8)', () => {
  const wf = parseYaml(fs.readFileSync(WORKFLOW, 'utf8')) as Record<string, any>;

  it('parses, runs Monday 09:15 UTC and on demand with an optional ledger filter', () => {
    expect(wf.name).toBe('Eval gate');
    expect(wf.on.schedule).toEqual([{ cron: '15 9 * * 1' }]);
    expect(wf.on.workflow_dispatch.inputs.ledgers.required).toBe(false);
    expect(wf.concurrency.group).toBe('eval-gate');
  });

  it('targets staging with the EVAL_GATE_TOKEN secret, skips with a notice when it is absent, and fails on a red gate', () => {
    const job = wf.jobs.gate;
    expect(job.env.API).toBe('https://api.staging.snotnoselegal.com');
    expect(job.env.TOKEN).toBe('${{ secrets.EVAL_GATE_TOKEN }}');
    expect(job['timeout-minutes']).toBeGreaterThanOrEqual(95);
    const steps: Array<{ name: string; id?: string; if?: string; run?: string; uses?: string; with?: Record<string, unknown> }> = job.steps;
    const secret = steps.find((s) => s.id === 'secret')!;
    expect(secret.run).toMatch(/::notice/);
    expect(secret.run).toMatch(/configured=false/);
    for (const s of steps.filter((s) => s.id !== 'secret')) expect(s.if, s.name).toMatch(/steps\.secret\.outputs\.configured == 'true'/);
    const start = steps.find((s) => s.id === 'start')!;
    expect(start.run).toMatch(/POST/);
    expect(start.run).toMatch(/\/ops\/eval\/runs/);
    expect(start.run).toMatch(/Authorization: Bearer \$TOKEN/);
    const wait = steps.find((s) => /Wait for every run/.test(s.name))!;
    expect(wait.run).toMatch(/seq 1 90/);
    expect(wait.run).toMatch(/sleep 60/);
    expect(wait.run).toMatch(/\/ops\/eval\/runs\?since=/);
    const summary = steps.find((s) => /Scorecard table/.test(s.name))!;
    expect(summary.run).toMatch(/scripts\/eval-gate-summary\.cjs eval-gate\.json/);
    expect(summary.run).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(summary.run).toMatch(/exit \$status/);
    const artifact = steps.find((s) => s.uses?.startsWith('actions/upload-artifact'))!;
    expect(String((artifact.with as { path: string }).path)).toMatch(/eval-gate\.json/);
  });

  it('the header tells the founder where the secret goes', () => {
    const text = fs.readFileSync(WORKFLOW, 'utf8');
    expect(text).toMatch(/Settings → Secrets/);
    expect(text).toMatch(/api-staging/);
    expect(text).toMatch(/render\.staging\.yaml/);
  });
});

describe('scripts/eval-gate-summary.cjs (J8)', () => {
  it('verdicts: SCORED+pass → PASS, SCORED red → FAIL, FAILED → ERROR, anything else INCOMPLETE', () => {
    expect(verdictOf({ status: 'SCORED', pass: true })).toBe('PASS');
    expect(verdictOf({ status: 'SCORED', pass: false })).toBe('FAIL');
    expect(verdictOf({ status: 'FAILED', pass: null })).toBe('ERROR');
    expect(verdictOf({ status: 'RUNNING', pass: null })).toBe('INCOMPLETE (RUNNING)');
  });

  it('the fixture as a whole is red: one FAIL, one ERROR, one still running', () => {
    const out = summarize(listing);
    expect(out.failed).toBe(true);
    expect(out.counts).toEqual({ total: 5, pass: 2, fail: 3 });
    expect(out.markdown).toMatch(/^## Eval gate: RED/);
    expect(out.markdown).toContain('| brian | 🔴 FAIL | 6/7 (86%) | 25% | EXTENDED | $24.00 | 93% | engine-prod · v2 abc123def456 | 2026-10-12 09:15 UTC |');
    expect(out.markdown).toContain('| gary | 🟢 PASS | 5/5 (100%) | 10% | EXTENDED | $13.00 | 96% |');
    expect(out.markdown).toContain('| brian | 🔴 ERROR | — | — | — | — | — | — |');
    expect(out.markdown).toContain('| gary | 🔴 INCOMPLETE (RUNNING) | — | — | EXTENDED | — |');
    expect(out.markdown).toContain('- **brian** — missed:willetts-seated-juror');
    expect(out.markdown).toContain('- **brian** — ERROR: digitization did not finish within 90 min');
    expect(out.markdown).toContain('| EXTENDED | 3 | $18.50 | $55.50 | 1 |');
    expect(out.markdown).toContain('| SHORT | 0 | — | $0.00 | 0 |');
  });

  it('selected by run id, the Monday pair is what it is: green when only the passing run is selected', () => {
    const green = summarize(listing, { runIds: ['er_gary'] });
    expect(green.failed).toBe(false);
    expect(green.markdown).toMatch(/^## Eval gate: GREEN/);
    expect(green.rows.map((r) => r.id)).toEqual(['er_gary']);
    const pair = summarize(listing, { runIds: ['er_gary', 'er_brian'] });
    expect(pair.failed).toBe(true);
    expect(pair.counts).toEqual({ total: 2, pass: 1, fail: 1 });
  });

  it('a run the api never reported, or no runs at all, is a red gate — never a silent pass', () => {
    const missing = summarize(listing, { runIds: ['er_gary', 'er_ghost'] });
    expect(missing.failed).toBe(true);
    expect(missing.missingIds).toEqual(['er_ghost']);
    expect(missing.markdown).toMatch(/never reported by the api: er_ghost/);
    expect(summarize({ runs: [] }).failed).toBe(true);
    expect(summarize(null).failed).toBe(true);
  });

  it('as a CLI it prints the Markdown and exits 1 on red, 0 on green, 0 with --no-fail', () => {
    const red = spawnSync(process.execPath, [SCRIPT, FIXTURE], { encoding: 'utf8' });
    expect(red.status).toBe(1);
    expect(red.stdout).toMatch(/^## Eval gate: RED/);
    const green = execFileSync(process.execPath, [SCRIPT, FIXTURE, '--ids', 'er_gary,er_old'], { encoding: 'utf8' });
    expect(green).toMatch(/^## Eval gate: GREEN/);
    expect(green).toMatch(/2 of 2 ledger run\(s\) passed/);
    expect(spawnSync(process.execPath, [SCRIPT, FIXTURE, '--no-fail'], { encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' }).status).toBe(2);
  });
});
