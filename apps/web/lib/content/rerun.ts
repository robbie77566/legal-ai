/**
 * The re-run card on the documents page once a review has finished (US-6):
 * the paid commitment to run again with new documents. The purchase reopens
 * the case for uploads; until then uploading is closed, so the card is the
 * one thing to do here. Both languages (i18n R1–R7).
 */
export const RERUN_CONTENT = {
  en: {
    title: 'Got new documents since your report?',
    body: 'A re-run reads everything again with what you add, and your earlier report stays available. Pay for the re-run first; this page then reopens so you can upload the new documents and start it.',
    button: 'Add them & re-run — {price}',
    opening: 'Opening secure checkout…',
    failed: 'We could not open checkout just now. Nothing was charged — try again in a moment, or reply to any of our emails.',
    canceled: 'Checkout was closed before paying. Nothing was charged; your report is unchanged.',
    running: 'Your review is running. New documents can be added once it finishes, as a re-run.',
    report: 'Open your report',
  },
  es: {
    title: '¿Tiene documentos nuevos desde su informe?',
    body: 'Una nueva revisión vuelve a leer todo junto con lo que agregue, y su informe anterior sigue disponible. Pague primero la nueva revisión; esta página se reabre después para que suba los documentos nuevos y la inicie.',
    button: 'Agregarlos y volver a revisar — {price}',
    opening: 'Abriendo el pago seguro…',
    failed: 'No pudimos abrir el pago en este momento. No se cobró nada — intente de nuevo en un momento, o responda a cualquiera de nuestros correos.',
    canceled: 'El pago se cerró antes de completarse. No se cobró nada; su informe no cambió.',
    running: 'Su revisión está en curso. Podrá agregar documentos nuevos cuando termine, como una nueva revisión.',
    report: 'Abrir su informe',
  },
}
