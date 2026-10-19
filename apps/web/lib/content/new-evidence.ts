/**
 * The new-evidence card on the family report (PRD FR-10; mvp_ui_design_spec
 * §5.7 "New-evidence flag (FR-10) renders as its own card"; persona plan §3
 * family tail, K3). Shown only when the case facts say the family told us
 * about evidence that was never presented. The family's words are printed
 * verbatim when a note exists; otherwise the card repeats the question they
 * were asked and the answer they gave — never an inference. The PDF
 * (packages/reports/family-report.ts) carries the same English copy.
 */
export const NEW_EVIDENCE_CONTENT = {
  en: {
    title: 'Evidence that was never presented',
    body: 'You told us about evidence that was never presented — this review can’t evaluate it, but your attorney must know about it.',
    said: 'What you told us',
    answeredYes: 'When we asked whether there is evidence that was never presented — like a recantation, an alibi, or a new witness — you answered yes.',
    next: 'Tell your attorney about it in your first conversation — it is not in the court record, so nothing in this report speaks to it.',
  },
  es: {
    title: 'Evidencia que nunca se presentó',
    body: 'Usted nos contó sobre evidencia que nunca se presentó — esta revisión no puede evaluarla, pero su abogado debe saberlo.',
    said: 'Lo que usted nos dijo',
    answeredYes: 'Cuando le preguntamos si hay evidencia que nunca se presentó — como una retractación, una coartada o un testigo nuevo — usted respondió que sí.',
    next: 'Cuéntele a su abogado en su primera conversación — no está en el expediente judicial, así que nada en este informe se refiere a ella.',
  },
}
