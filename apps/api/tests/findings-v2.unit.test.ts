import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseFindingsText, buildScreenInstruction, screensForLane, promptSet, promptHash, structuredFields, strongerPreserved, groundUnion } from '../src/services/analysis.service';

const chunks = [
  { id: 'ch1', documentId: 'd1', content: 'MR. DAVIS: Objection, Confrontation Clause. THE COURT: Overruled. The DNA report was prepared by Patnaik.', metadata: {} },
  { id: 'ch2', documentId: 'd1', content: 'THE COURT: I sentence you to life in prison with a $10,000 fine.', metadata: {} },
];
const base = { category: 'confrontation', severity: 'supportive', confidence: 0.8, chunkIndex: 0, quote: 'The DNA report was prepared by Patnaik.', partA: 'a', partB: 'b' };

describe('prompt set selection', () => {
  const env = process.env.ANALYSIS_PROMPT_SET;
  afterEach(() => { if (env === undefined) delete process.env.ANALYSIS_PROMPT_SET; else process.env.ANALYSIS_PROMPT_SET = env; });
  it('v1 keeps the launch screens and prompt byte-identical', () => {
    process.env.ANALYSIS_PROMPT_SET = 'v1';
    expect(promptSet()).toBe('v1');
    expect(screensForLane('TRIAL')).toEqual(['iac', 'brady', 'junk_science', 'sentencing', 'voir_dire']);
    const text = buildScreenInstruction('iac', chunks);
    expect(text).not.toContain('"preserved"');
    expect(text).not.toContain('Also compare the State');
  });
  it('v2 adds the two screens and the structured fields', () => {
    process.env.ANALYSIS_PROMPT_SET = 'v2';
    expect(screensForLane('TRIAL')).toEqual(['preserved_error', 'iac', 'brady', 'junk_science', 'sentencing', 'voir_dire', 'identification']);
    expect(screensForLane('PLEA')).toEqual(['plea_lane', 'sentencing']);
    const text = buildScreenInstruction('iac', chunks);
    expect(text).toContain('"preserved":"yes|partial|no|unknown"');
    expect(text).toContain('44.2(a)');
    expect(text).toContain('Also compare the State');
    expect(buildScreenInstruction('preserved_error', chunks)).toContain('38.072');
    expect(buildScreenInstruction('identification', chunks)).toContain('Biggers');
  });
  it('the prompt hash distinguishes the sets and is stable', () => {
    expect(promptHash('v1')).not.toBe(promptHash('v2'));
    expect(promptHash('v2')).toBe(promptHash('v2'));
    expect(promptHash('v2')).toHaveLength(12);
  });
});

describe('parser leniency for the v2 fields', () => {
  it('keeps the fields when present and clips the long ones', () => {
    const raw = JSON.stringify({ findings: [{ ...base, preserved: 'yes', preservedCite: 'THE COURT: Overruled.', harmStandard: 'constitutional', develop: 'x'.repeat(900), dependsOn: ['Volume 6 exhibits', 42, 'y'.repeat(300)] }] });
    const p = parseFindingsText(raw)!;
    expect(p.findings).toHaveLength(1);
    const f = p.findings[0];
    expect(f.preserved).toBe('yes');
    expect(f.develop).toHaveLength(400);
    expect(f.dependsOn).toEqual(['Volume 6 exhibits', 'y'.repeat(120)]);
  });
  it('a finding without the fields, or with garbage in them, is still a finding', () => {
    const raw = JSON.stringify({ findings: [base, { ...base, preserved: 17, harmStandard: { no: true }, develop: null, dependsOn: 'not a list' }] });
    const p = parseFindingsText(raw)!;
    expect(p.findings).toHaveLength(2);
    expect(p.findings[1].preserved).toBeUndefined();
    expect(p.findings[1].dependsOn).toBeUndefined();
  });
  it('survives a truncated response with the fields inside', () => {
    const one = JSON.stringify({ ...base, preserved: 'partial', develop: 'obtain the lab file' });
    const raw = `{"findings":[${one},{"category":"iac","severity":"suppo`;
    const p = parseFindingsText(raw)!;
    expect(p.findings).toHaveLength(1);
    expect(p.findings[0].preserved).toBe('partial');
  });
  it('v2 fields ride through grounding', () => {
    const r = groundUnion([[{ ...base, preserved: 'yes', develop: 'd' } as never]], chunks as never);
    expect(r.grounded).toHaveLength(1);
    expect((r.grounded[0] as { preserved?: string }).preserved).toBe('yes');
  });
});

describe('structured fields as persisted', () => {
  it('keeps a preservation cite only when it grounds verbatim somewhere in the record', () => {
    const kept = structuredFields({ category: 'confrontation', preserved: 'yes', preservedCite: 'THE COURT: Overruled.' }, 'preserved_error', chunks);
    expect(kept.preservedCite).toBe('THE COURT: Overruled.');
    const dropped = structuredFields({ category: 'confrontation', preserved: 'yes', preservedCite: 'THE COURT: Sustained, and a mistrial is granted.' }, 'preserved_error', chunks);
    expect(dropped.preservedCite).toBeNull();
    expect(dropped.preserved).toBe('yes'); // the call survives; only the unverifiable cite is dropped
  });
  it('derives the vehicle and normalizes the enums', () => {
    const f = structuredFields({ category: 'unauthorized fine', preserved: 'dunno', harmStandard: 'whatever' }, 'sentencing', chunks);
    expect(f).toMatchObject({ preserved: 'unknown', harmStandard: 'none', vehicle: 'either', develop: null, dependsOn: [] });
    expect(structuredFields({ category: 'hearsay', preserved: 'not preserved' }, 'preserved_error', chunks).vehicle).toBe('writ');
  });
  it('on a cross-screen merge the stronger preservation call wins, a grounded cite breaks ties', () => {
    expect(strongerPreserved('unknown', 'yes', false)).toBe('yes');
    expect(strongerPreserved('yes', 'partial', true)).toBe('yes');
    expect(strongerPreserved('yes', 'yes', true)).toBe('yes');
    expect(strongerPreserved('partial', 'partial', true)).toBe('partial');
    expect(strongerPreserved('no', 'unknown', false)).toBe('no');
  });
});
