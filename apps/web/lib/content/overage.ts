/**
 * The overage offer card on the documents page (mvp_ui_design_spec §5.5 "page
 * meter … becomes an inline overage offer card at the cap — never a modal
 * ambush"; upload_page_ux_review F8; persona plan §3 family tail, K1/K2).
 * Placeholders are filled with `tpl` from lib/i18n; the numbers come from the
 * api's 402 or the page meter, never from this file. Price and block rule:
 * 5,000 pages included, $49 per 2,500-page block — unchanged here.
 */
export const OVERAGE_CONTENT = {
  en: {
    title: 'Your record is {pages} pages.',
    offer: 'The review covers {included}. Add {addPages} more pages for {price}.',
    blocks: 'That is {blocks} blocks of 2,500 pages at {blockPrice} each — exactly what this record needs, never rounded up.',
    safe: 'Nothing is lost. Every page you sent is safe here. The pages beyond the first {allowance} simply wait until you add them, and nothing is charged until you choose to.',
    button: 'Add pages — {price}',
    opening: 'Opening the payment page…',
    failed: 'We couldn’t open the payment page just now. Nothing was charged — please try again in a moment.',
    paid: 'Thank you — your extra pages are covered. Mark your records complete whenever you are ready.',
    confirming: 'Your payment is being confirmed — this usually takes a moment. If this card is still here in a minute, refresh the page.',
  },
  es: {
    title: 'Su expediente tiene {pages} páginas.',
    offer: 'La revisión cubre {included}. Agregue {addPages} páginas más por {price}.',
    blocks: 'Son {blocks} bloques de 2,500 páginas a {blockPrice} cada uno — exactamente lo que este expediente necesita, nunca redondeado hacia arriba.',
    safe: 'No se pierde nada. Cada página que envió está segura aquí. Las páginas después de las primeras {allowance} simplemente esperan hasta que usted las agregue, y no se cobra nada hasta que usted lo decida.',
    button: 'Agregar páginas — {price}',
    opening: 'Abriendo la página de pago…',
    failed: 'No pudimos abrir la página de pago en este momento. No se cobró nada — inténtelo de nuevo en un momento.',
    paid: 'Gracias — sus páginas adicionales ya están cubiertas. Marque sus documentos como completos cuando esté listo.',
    confirming: 'Estamos confirmando su pago — normalmente toma un momento. Si esta tarjeta sigue aquí en un minuto, actualice la página.',
  },
}
