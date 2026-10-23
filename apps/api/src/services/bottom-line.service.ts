import { bottomLine, type BottomLine } from '@hg/case-lifecycle';

/** The bottom line for a report, from its visible findings and posture. */
export function bottomLineFor(
  findings: Array<{ severity: string }>,
  subsequentWritMode: boolean,
  deadlinePosture:
    | {
        finalityDate?: string;
        aedpa: { expired: boolean; daysRemaining: number; daysTolled?: number; estimatedExpiryDate?: string | null; tollingNow?: boolean };
        lachesUrgency: boolean;
      }
    | null
    | undefined
): BottomLine {
  const count = (sev: string) => findings.filter((f) => f.severity === sev).length;
  return bottomLine({
    strong: count('dispositive'),
    supportive: count('supportive'),
    background: count('background'),
    subsequentWritMode,
    // UPL review 2026-10-23 (E1): the dates travel so the bottom line can print "ended on / open until DATE by our count".
    deadline: deadlinePosture
      ? {
          aedpaExpired: deadlinePosture.aedpa.expired,
          daysRemaining: deadlinePosture.aedpa.daysRemaining,
          lachesUrgency: deadlinePosture.lachesUrgency,
          estimatedExpiryDate: deadlinePosture.aedpa.estimatedExpiryDate ?? null,
          tollingNow: deadlinePosture.aedpa.tollingNow ?? false,
          finalityDate: deadlinePosture.finalityDate ?? null,
          daysTolled: deadlinePosture.aedpa.daysTolled ?? 0,
        }
      : null,
  });
}
