/**
 * Report template version and what each version changed, in the family's
 * words. A republish (ops) re-releases the latest findings on the current
 * template and tells the family exactly what is different — the findings
 * themselves never change without a new analysis run.
 */
export const TEMPLATE_CHANGELOG: Array<{ version: string; notes: string[] }> = [
  { version: 'AB-v1', notes: [] },
  {
    version: 'AB-v2',
    notes: [
      'Every issue now opens with a weight line: how much it could matter if it holds up, and how sure we are that it is really in the record, as a percentage.',
      'Strong signals are shown in red and possible issues in amber so the most serious items stand out, with a short legend above the issues explaining the words.',
      'A new "About this case" section at the top: the person, county, dates, offense, verdict, and any appeals or writs, each marked as from the record or from your answers.',
      'A new "The bottom line" section right after the summary: whether what we found is worth taking to a lawyer, in plain words.',
      'Our website, snotnoselegal.com, is named on the cover, in the footer, and in the closing note.',
    ],
  },
];

export const TEMPLATE_VERSION = TEMPLATE_CHANGELOG[TEMPLATE_CHANGELOG.length - 1].version;

/** Notes for every template version released after `prior` (unknown prior → everything). */
export function templateNotesSince(prior: string | null | undefined): string[] {
  const idx = TEMPLATE_CHANGELOG.findIndex((t) => t.version === prior);
  return TEMPLATE_CHANGELOG.slice(idx + 1).flatMap((t) => t.notes);
}
