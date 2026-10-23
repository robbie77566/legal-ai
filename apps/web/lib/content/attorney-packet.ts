/**
 * The "For your lawyer" card on the family report (UPL review 2026-10-23,
 * finding E2, recommendation 5; counsel question 3 pending). Shown while the
 * `family_part_b` flag is off: the attorney content — Part B, the
 * preservation call, the harm standard, the vehicle, the develop steps, the
 * issues-by-priority table and the investigation checklist — is a separate
 * document the family downloads sealed and hands to licensed counsel, or
 * shares by link. The PDF (packages/reports/family-report.ts,
 * FOR_YOUR_LAWYER_COPY) carries the same words in both languages.
 */
export const ATTORNEY_PACKET_CONTENT = {
  en: {
    title: 'For your lawyer',
    body: 'The part of this review written for an attorney is a separate document: the attorney packet. You can download it sealed and hand it to your lawyer, or share it with them by a private link from your case page. It describes what the record shows for each issue in a lawyer’s terms; it is information about a court record, not legal advice, and a lawyer decides what, if anything, to do with it.',
    download: 'Download the attorney packet (sealed)',
    share: 'Share with a lawyer',
    /** Under the two actions: what "sealed" means here. */
    sealedNote: 'Sealed means it is written for the lawyer, not for you — you can open it, but nothing in it is addressed to your family.',
  },
  es: {
    title: 'Para su abogado',
    body: 'La parte de esta revisión escrita para un abogado es un documento aparte: el paquete para el abogado. Puede descargarlo sellado y entregarlo a su abogado, o compartirlo con él por un enlace privado desde la página de su caso. Describe lo que muestra el expediente sobre cada asunto en términos de abogado; es información sobre un expediente judicial, no asesoría legal, y un abogado decide qué hacer con ella, si es que hay algo que hacer.',
    download: 'Descargar el paquete para el abogado (sellado)',
    share: 'Compartir con un abogado',
    sealedNote: 'Sellado quiere decir que está escrito para el abogado, no para usted — puede abrirlo, pero nada en él está dirigido a su familia.',
  },
}
