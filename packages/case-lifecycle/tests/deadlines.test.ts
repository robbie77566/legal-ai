/**
 * FR-5 deadline engine — driven by the counsel-review vector table
 * (deadline-vectors.json). The table is the artifact an attorney signs;
 * this test guarantees the code matches the signed table, forever.
 */
import { describe, it, expect } from 'vitest';
import { computeDeadlinePosture, addDays, diffDays, type DeadlineInputs } from '../deadlines';
import vectors from './deadline-vectors.json';

describe('date math (civil dates, no timezone conversion)', () => {
  it('adds and diffs across DST boundaries without off-by-one', () => {
    // US DST spring-forward 2024-03-10 — the classic timestamp bug.
    expect(addDays('2024-03-09', 2)).toBe('2024-03-11');
    expect(diffDays('2024-03-09', '2024-03-11')).toBe(2);
    expect(addDays('2024-11-02', 2)).toBe('2024-11-04'); // fall-back
    expect(diffDays('2024-01-10', '2024-02-09')).toBe(30);
  });
});

describe('FR-5 vectors (attorney sign-off table)', () => {
  for (const v of vectors.vectors) {
    it(v.name, () => {
      const posture = computeDeadlinePosture(v.inputs as unknown as DeadlineInputs);
      const flat: Record<string, unknown> = {
        finalityDate: posture.finalityDate,
        daysElapsed: posture.aedpa.daysElapsed,
        daysTolled: posture.aedpa.daysTolled,
        daysRemaining: posture.aedpa.daysRemaining,
        expired: posture.aedpa.expired,
        tollingNow: posture.aedpa.tollingNow,
        estimatedExpiryDate: posture.aedpa.estimatedExpiryDate,
        copyKey: posture.aedpa.copyKey,
        lachesUrgency: posture.lachesUrgency,
      };
      for (const [key, expected] of Object.entries(v.expect)) {
        expect(flat[key], key).toEqual(expected);
      }
    });
  }

  it('the vector table itself records its sign-off state', () => {
    // Launch gate: flip to true ONLY when a licensed attorney signs the
    // table (PRD §7.2). CI carries the pending state visibly, not silently.
    expect(typeof vectors.counselSigned).toBe('boolean');
    if (!vectors.counselSigned) {
      console.warn('[FR-5] deadline vectors are NOT yet counsel-signed — launch gate open');
    }
  });

  it('every posture carries the verification disclaimer', () => {
    const p = computeDeadlinePosture({ judgmentDate: '2024-01-10', asOf: '2024-03-01' });
    expect(p.disclaimerKey).toBe('deadline.verify_with_attorney');
    expect(p.finalityBasis).toContain('TRAP');
  });
});
