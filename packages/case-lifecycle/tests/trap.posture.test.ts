/**
 * Workstream E — §2254 exhaustion map and the Art. 11.07 §4 posture (E5).
 */
import { describe, it, expect } from 'vitest';
import { exhaustionMap, posture1107 } from '../trap';
import { computeDeadlinePosture } from '../deadlines';

describe('E5 — §2254 exhaustion map', () => {
  it('applies the documented rule per ground', () => {
    const m = exhaustionMap({
      grounds: [
        { id: 'g1', raisedOnDirectAppeal: true, raisedIn1107: false, decidedOnMerits: true },
        { id: 'g2', raisedOnDirectAppeal: false, raisedIn1107: true, decidedOnMerits: true },
        { id: 'g3', raisedOnDirectAppeal: false, raisedIn1107: true, decidedOnMerits: false },
        { id: 'g4', raisedOnDirectAppeal: false, raisedIn1107: false, decidedOnMerits: false },
        { id: 'g5', raisedOnDirectAppeal: true, raisedInPdr: false, raisedIn1107: false, decidedOnMerits: true },
        { id: 'g6', raisedOnDirectAppeal: false, raisedIn1107: true, decidedOnMerits: false, pending: true },
      ],
      priorWritsDecidedOnMerits: 0,
    });
    const by = Object.fromEntries(m.grounds.map((g) => [g.id, g.status]));
    expect(by).toEqual({
      g1: 'exhausted',
      g2: 'exhausted',
      g3: 'procedurally_defaulted',
      g4: 'unexhausted',
      g5: 'unexhausted', // never fairly presented to the CCA (no PDR) and no 11.07 yet
      g6: 'unexhausted', // still pending in state court
    });
    expect(m.summary).toEqual({ exhausted: 2, unexhausted: 3, procedurallyDefaulted: 1 });
    expect(m.mixedPetition).toBe(true);
    expect(m.confidence).toBe('proposed');
    expect(m.grounds.every((g) => g.basis.length > 10)).toBe(true);
  });

  it('an unraised ground after a merits 11.07 is procedurally defaulted (§4 would bar the return trip)', () => {
    const m = exhaustionMap({
      grounds: [{ id: 'g', raisedOnDirectAppeal: false, raisedIn1107: false, decidedOnMerits: false }],
      priorWritsDecidedOnMerits: 1,
    });
    expect(m.grounds[0].status).toBe('procedurally_defaulted');
    expect(m.grounds[0].basis).toMatch(/§ ?4/);
    expect(m.mixedPetition).toBe(false);
  });

  it('delegates the AEDPA posture to computeDeadlinePosture rather than recomputing it', () => {
    const deadlines = {
      judgmentDate: '2024-01-10',
      coaJudgmentDate: '2025-01-10',
      stateWrits: [{ filedDate: '2025-06-01', disposedDate: '2025-09-01' }],
      asOf: '2026-01-10',
    };
    const m = exhaustionMap({ grounds: [], deadlines });
    expect(m.aedpa).toEqual(computeDeadlinePosture(deadlines));
    expect(exhaustionMap({ grounds: [] }).aedpa).toBeUndefined();
  });
});

describe('E5 — Art. 11.07 §4 posture', () => {
  it('a first application is the one shot: no §4 flag, complete-inventory warning on', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 0 });
    expect(p.subsequentWrit).toBe(false);
    expect(p.section4Bar).toBe(false);
    expect(p.oneShot).toBe(true);
    expect(p.completeInventoryWarning).toBe(true);
    expect(p.copyKeys).toContain('writ.one_shot');
    expect(p.copyKeys).toContain('writ.complete_inventory');
    expect(p.noRehearing.rule).toBe('TRAP 79.2(d)');
  });

  it('a prior application decided on the merits raises the §4 subsequent-writ flag with its two exceptions', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 1 });
    expect(p.subsequentWrit).toBe(true);
    expect(p.section4Bar).toBe(true);
    expect(p.oneShot).toBe(false);
    expect(p.exceptions.map((e) => e.id)).toEqual(['4(a)(1)', '4(a)(2)']);
    expect(p.copyKeys).toContain('writ.subsequent_bar');
    expect(p.authority).toMatch(/11\.07/);
  });

  it('prior applications dismissed without a merits ruling do not count as subsequent', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 2, priorWritsDecidedOnMerits: 0 });
    expect(p.subsequentWrit).toBe(false);
    expect(p.notes.join(' ')).toMatch(/dismiss/i);
  });

  it('a pending direct appeal makes the filing premature', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 0, directAppealPending: true });
    expect(p.prematureFiling).toBe(true);
    expect(p.copyKeys).toContain('writ.premature');
  });

  it('11.072 and 11.071 carry their own subsequent-application bars; 11.09 has none in the statute', () => {
    expect(posture1107({ vehicle: '11.072', priorWrits: 1 }).authority).toMatch(/11\.072/);
    expect(posture1107({ vehicle: '11.071', priorWrits: 1 }).authority).toMatch(/11\.071/);
    const misd = posture1107({ vehicle: '11.09', priorWrits: 1 });
    expect(misd.section4Bar).toBe(false);
    expect(misd.subsequentWrit).toBe(true);
  });
});
