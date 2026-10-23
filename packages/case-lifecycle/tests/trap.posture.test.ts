/**
 * Workstream E — the §2254 state-remedies map and the Art. 11.07 §4 posture
 * (E5), as revised by the UPL review of 2026-10-23 (P5, recommendation 6;
 * workstream U5-b): both DESCRIBE. The posture prints the recorded inputs
 * and the rule in neutral words; the map's labels say what the inputs show
 * about state remedies ("shown / not shown / unclear"), never "exhausted"
 * or "procedurally defaulted".
 */
import { describe, it, expect } from 'vitest';
import { exhaustionMap, posture1107, decidedOnMeritsLabel, EXHAUSTION_STATUS_LABEL, EXHAUSTION_RULE } from '../trap';
import { computeDeadlinePosture } from '../deadlines';

describe('E5 — §2254 state-remedies map', () => {
  it('applies the documented reading per ground, in descriptive labels', () => {
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
      g1: 'shown',
      g2: 'shown',
      g3: 'unclear', // presented, disposed of on a procedural ground: what follows is counsel's call
      g4: 'not_shown',
      g5: 'not_shown', // never presented to the CCA (no PDR) and no merits 11.07 yet
      g6: 'not_shown', // still pending in state court
    });
    expect(m.summary).toEqual({ shown: 2, notShown: 3, unclear: 1 });
    expect(m.mixed).toBe(true);
    expect(m.confidence).toBe('proposed');
    expect(m.grounds.every((g) => g.basis.length > 10)).toBe(true);
  });

  it('an unraised ground after a merits 11.07 is "unclear" (a return to state court would meet the §4 rule), not a verdict', () => {
    const m = exhaustionMap({
      grounds: [{ id: 'g', raisedOnDirectAppeal: false, raisedIn1107: false, decidedOnMerits: false }],
      priorWritsDecidedOnMerits: 1,
    });
    expect(m.grounds[0].status).toBe('unclear');
    expect(m.grounds[0].basis).toMatch(/§ ?4/);
    expect(m.grounds[0].basis).toMatch(/for counsel/);
    expect(m.mixed).toBe(false);
  });

  it('labels, bases and the rule never say "exhausted" or "procedurally defaulted", and name no case', () => {
    const m = exhaustionMap({
      grounds: [
        { id: 'a', raisedOnDirectAppeal: true, raisedIn1107: false, decidedOnMerits: true },
        { id: 'b', raisedOnDirectAppeal: false, raisedIn1107: true, decidedOnMerits: false },
        { id: 'c', raisedOnDirectAppeal: false, raisedIn1107: false, decidedOnMerits: false },
        { id: 'd', raisedOnDirectAppeal: true, raisedInPdr: false, raisedIn1107: false, decidedOnMerits: true },
        { id: 'e', raisedOnDirectAppeal: false, raisedIn1107: false, decidedOnMerits: false, pending: true },
      ],
      priorWritsDecidedOnMerits: 1,
    });
    const text = JSON.stringify(m) + JSON.stringify(EXHAUSTION_STATUS_LABEL) + EXHAUSTION_RULE;
    expect(text).not.toMatch(/\bexhausted\b/i);
    expect(text).not.toMatch(/procedurally defaulted|procedurally_defaulted/i);
    expect(text).not.toMatch(/\bv\. /);
    expect(Object.values(EXHAUSTION_STATUS_LABEL)).toEqual(['state remedies: shown', 'state remedies: not shown', 'state remedies: unclear']);
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

describe('E5 / U5-b — Art. 11.07 §4 posture: recorded inputs and the rule', () => {
  const RULE = 'Under Article 11.07 §4 a later application must plead one of the statutory exceptions unless the earlier one was dismissed without reaching the merits.';

  it('no prior application recorded: the count, the rule, the complete-inventory line; no verdict about what is lost', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 0 });
    expect(p.inputs).toEqual({ priorWrits: 0, priorWritsDecidedOnMerits: null, directAppealPending: false });
    expect(p.priorApplicationsLine).toBe('Prior applications recorded: 0');
    expect(p.rule).toBe(RULE);
    expect(p.statutoryRule).toBe(true);
    expect(p.completeInventoryWarning).toBe(true);
    expect(p.copyKeys).toEqual(['writ.complete_inventory', 'writ.no_rehearing']);
    expect(p.noRehearing.rule).toBe('TRAP 79.2(d)');
    expect(p.notes).toEqual([]);
    expect(JSON.stringify(p)).not.toMatch(/ordinarily lost|one-shot|oneShot|Applies|section4Bar|subsequentWrit/);
  });

  it('a prior application with the merits fact not recorded: the line says so and the note asks counsel to confirm', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 1 });
    expect(p.inputs.priorWritsDecidedOnMerits).toBeNull();
    expect(p.priorApplicationsLine).toBe('Prior applications recorded: 1; whether they were decided on the merits: not recorded');
    expect(p.rule).toBe(RULE);
    expect(p.exceptions.map((e) => e.id)).toEqual(['4(a)(1)', '4(a)(2)']);
    expect(p.copyKeys).toContain('writ.prior_applications');
    expect(p.notes.join(' ')).toMatch(/not recorded on this matter; counsel to confirm/);
    expect(p.authority).toMatch(/11\.07/);
    // Nothing is assumed: the engine no longer treats an unrecorded fact as "decided on the merits".
    expect(JSON.stringify(p)).not.toMatch(/assumed|Applies|Subsequent application/);
  });

  it('the recorded fact prints as "yes" or "no" and the note disappears', () => {
    const yes = posture1107({ vehicle: '11.07', priorWrits: 2, priorWritsDecidedOnMerits: true });
    expect(yes.priorApplicationsLine).toBe('Prior applications recorded: 2; whether they were decided on the merits: yes');
    expect(yes.notes).toEqual([]);
    const no = posture1107({ vehicle: '11.07', priorWrits: 2, priorWritsDecidedOnMerits: false });
    expect(no.priorApplicationsLine).toBe('Prior applications recorded: 2; whether they were decided on the merits: no');
    expect(no.notes).toEqual([]);
    expect(no.rule).toBe(RULE); // the same rule, whatever the fact: the engine prints both and concludes nothing
    expect(decidedOnMeritsLabel(null)).toBe('not recorded');
    expect(decidedOnMeritsLabel(undefined)).toBe('not recorded');
    expect(decidedOnMeritsLabel(true)).toBe('yes');
    expect(decidedOnMeritsLabel(false)).toBe('no');
  });

  it('a pending direct appeal is echoed as an input with the premature-filing rule in neutral words', () => {
    const p = posture1107({ vehicle: '11.07', priorWrits: 0, directAppealPending: true });
    expect(p.inputs.directAppealPending).toBe(true);
    expect(p.copyKeys).toContain('writ.premature');
    expect(p.prematureFilingRule).toMatch(/dismissed rather than held/);
    expect(p.notes.join(' ')).toMatch(/recorded as pending/);
  });

  it('11.072 and 11.071 carry their own rules; 11.09 states none as read here, and the engine says so without a verdict', () => {
    expect(posture1107({ vehicle: '11.072', priorWrits: 1 }).authority).toMatch(/11\.072/);
    expect(posture1107({ vehicle: '11.072', priorWrits: 1 }).rule).toMatch(/^Under Article 11\.072 §9 a later application must plead/);
    expect(posture1107({ vehicle: '11.071', priorWrits: 1 }).authority).toMatch(/11\.071/);
    const misd = posture1107({ vehicle: '11.09', priorWrits: 1 });
    expect(misd.statutoryRule).toBe(false);
    expect(misd.exceptions).toEqual([]);
    expect(misd.rule).toMatch(/states no subsequent-application rule as read here/);
    expect(misd.rule).toMatch(/for counsel/);
    expect(misd.copyKeys).toContain('writ.no_statutory_rule');
  });

  it('names no case anywhere in its output', () => {
    for (const p of [posture1107({ vehicle: '11.07', priorWrits: 2 }), posture1107({ vehicle: '11.07', priorWrits: 2, priorWritsDecidedOnMerits: false, directAppealPending: true }), posture1107({ vehicle: '11.09', priorWrits: 1 })]) {
      expect(JSON.stringify(p)).not.toMatch(/\bv\. |Ex parte|Torres|Johnson/);
    }
  });
});
