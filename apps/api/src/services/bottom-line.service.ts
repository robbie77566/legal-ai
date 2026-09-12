import { bottomLine, type BottomLine } from '@hg/case-lifecycle';

/** The bottom line for a report, from its visible findings and posture. */
export function bottomLineFor(
  findings: Array<{ severity: string }>,
  subsequentWritMode: boolean,
  deadlinePosture: { aedpa: { expired: boolean; daysRemaining: number }; lachesUrgency: boolean } | null | undefined
): BottomLine {
  const count = (sev: string) => findings.filter((f) => f.severity === sev).length;
  return bottomLine({
    strong: count('dispositive'),
    supportive: count('supportive'),
    background: count('background'),
    subsequentWritMode,
    deadline: deadlinePosture ? { aedpaExpired: deadlinePosture.aedpa.expired, daysRemaining: deadlinePosture.aedpa.daysRemaining, lachesUrgency: deadlinePosture.lachesUrgency } : null,
  });
}
