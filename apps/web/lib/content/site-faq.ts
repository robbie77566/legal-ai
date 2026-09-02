import { LANDING_CONTENT } from './landing'

/** Site FAQ (snotnoselegal_site_design.md §3): the landing's accordion plus
 * the operational questions that don't belong on a conversion page. */
const EXTRA = {
  en: [
    [
      'How long does the review take?',
      'Ten business days from the moment you tell us your records are complete — most arrive sooner. You can watch live progress the whole way, including which checks have finished.',
    ],
    [
      'What file formats can I send?',
      'PDFs and phone photos (JPG, PNG, iPhone HEIC, TIFF). You can also put everything in one ZIP file and send it in a single upload — we open it, read every document, and tell you if anything inside couldn’t be used.',
    ],
    [
      'What happens if you find nothing?',
      'The report says so, plainly, and explains what we checked. A clear "nothing strong here" protects your family from spending thousands chasing weak claims — that is real information, and it is treated with the same care as any other result.',
    ],
    [
      'What happens to our documents and data?',
      'Your files are stored encrypted, they remain downloadable by you at any time, and deletion is available on request. We never sell your information. The details live in our Privacy page and Disclosures.',
    ],
    [
      'Can I pay in installments?',
      'Yes — Affirm and Klarna are available at checkout, through Stripe.',
    ],
    [
      'What if I upload documents and then find more?',
      'Uploading is free and unlimited before you start the review — take weeks if you need. After a report is delivered, running a fresh analysis that includes newly found documents costs $99.',
    ],
  ],
  es: [
    [
      '¿Cuánto tarda la revisión?',
      'Diez días hábiles desde el momento en que nos dice que sus documentos están completos — la mayoría llega antes. Puede ver el progreso en vivo todo el tiempo, incluyendo qué verificaciones han terminado.',
    ],
    [
      '¿Qué formatos de archivo puedo enviar?',
      'PDFs y fotos del teléfono (JPG, PNG, HEIC de iPhone, TIFF). También puede poner todo en un archivo ZIP y enviarlo en una sola subida — lo abrimos, leemos cada documento y le decimos si algo no se pudo usar.',
    ],
    [
      '¿Qué pasa si no encuentran nada?',
      'El informe lo dice claramente y explica qué verificamos. Un "no hay nada fuerte aquí" honesto protege a su familia de gastar miles persiguiendo reclamos débiles — esa también es información real, y se trata con el mismo cuidado que cualquier otro resultado.',
    ],
    [
      '¿Qué pasa con nuestros documentos y datos?',
      'Sus archivos se guardan cifrados, usted puede descargarlos en cualquier momento, y puede pedir su eliminación. Nunca vendemos su información. Los detalles están en nuestra página de Privacidad y en las Divulgaciones.',
    ],
    [
      '¿Puedo pagar a plazos?',
      'Sí — Affirm y Klarna están disponibles al pagar, a través de Stripe.',
    ],
    [
      '¿Y si subo documentos y luego encuentro más?',
      'Subir es gratis e ilimitado antes de empezar la revisión — tómese semanas si las necesita. Después de entregado un informe, ejecutar un análisis nuevo que incluya documentos recién encontrados cuesta $99.',
    ],
  ],
}

export const SITE_FAQ_CONTENT = {
  en: {
    title: 'Your questions, answered',
    faq: [...LANDING_CONTENT.en.faq, ...EXTRA.en],
  },
  es: {
    title: 'Sus preguntas, respondidas',
    faq: [...LANDING_CONTENT.es.faq, ...EXTRA.es],
  },
}
