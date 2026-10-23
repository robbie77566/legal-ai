import { NOT_A_LAW_FIRM } from '@hg/case-lifecycle'

/**
 * Terms of service (landing_page_spec.md §5; UPL review 2026-10-23, rec 10).
 * DRAFT — assembles the promises the buy cards and the landing already make,
 * in the Daybreak voice, both languages. English governs pending counsel.
 */
export const TERMS_CONTENT = {
  en: {
    draft: 'DRAFT — pending review by licensed counsel. Not yet effective.',
    title: 'Terms of service',
    intro:
      'These are the terms between you and Tangent Solutions LLC, which operates Snot Nose Legal. They are written to be read, not skimmed — every promise here is one we already make on the pages where you buy.',
    statement: NOT_A_LAW_FIRM.en,
    sections: [
      [
        'What the service is',
        'A case review is a detailed, AI-generated reading of the court record you upload — up to 5,000 pages — that reports what is in that record, with every finding quoted from the record by page and line. It arrives as Part A, written in plain words for your family, and Part B, written for the lawyer you hand it to, on the web and as a PDF.',
      ],
      [
        'What the service is not',
        'It is not legal advice, and it is not a substitute for the advice of an attorney. We are not a law firm, no one here acts as your attorney, and buying a review creates no attorney-client relationship and no privilege. We do not prepare, select or file court documents, and we never tell you or your loved one what to file. Any dates or time limits in a report are arithmetic from the dates you gave us and the dates in the record; only an attorney can verify a deadline.',
      ],
      [
        'No outcome is promised',
        'We cannot promise relief, release, or any court outcome. We promise a careful, cited reading of what is in the record — and that if we find nothing, the report says so plainly.',
      ],
      [
        'Price and scope',
        '$299 covers everything up to 5,000 pages. More pages are $49 per additional 2,500, and we ask first. Running the analysis again later, with new documents, is $99. Audio and video are not included. Uploading documents is free and unlimited before the review starts; the review runs once, when you tell us your records are complete.',
      ],
      [
        'Refunds',
        'If we cannot read your records, we stop before analyzing and you choose: re-upload or a refund. The full refund policy is on its own page.',
      ],
      [
        'Your documents and your data',
        'You confirm you are entitled to possess the records you upload. Your records are encrypted, seen only by our review staff, kept 12 months, and deleted sooner on request. You can download everything you uploaded at any time. The details are in our Privacy page.',
      ],
      [
        'Sharing the report',
        'You decide who sees your report. A share link to Part B expires in 30 days and can be turned off by you at any time; consent to share with a clinic is off until you turn it on. Sharing a report with a lawyer or a clinic does not by itself make them your lawyer or create privilege.',
      ],
      [
        'Your account',
        'Keep your password to yourself; you are responsible for what happens under your sign-in. You can change your email, change your password, or ask us to delete your account from your account page.',
      ],
      [
        'Questions and disputes',
        'Write to admin@snotnoselegal.com first — a person reads every message, and most things are sorted out there. Where these terms fall silent, the law of Texas applies. The English version of these terms governs.',
      ],
    ] as [string, string][],
    related: 'Related pages: the Refund policy, our Disclosures, and the Privacy page.',
  },
  es: {
    draft: 'BORRADOR — pendiente de revisión por un abogado con licencia. Todavía no está en vigor.',
    title: 'Términos del servicio',
    intro:
      'Estos son los términos entre usted y Tangent Solutions LLC, que opera Snot Nose Legal. Están escritos para leerse, no para pasarse por encima — cada promesa aquí ya la hacemos en las páginas donde usted compra.',
    statement: NOT_A_LAW_FIRM.es,
    sections: [
      [
        'Qué es el servicio',
        'Una revisión de caso es una lectura detallada, generada por inteligencia artificial, del expediente judicial que usted sube — hasta 5,000 páginas — que informa lo que hay en ese expediente, con cada hallazgo citado del expediente por página y línea. Llega como la Parte A, escrita en palabras sencillas para su familia, y la Parte B, escrita para el abogado al que se la entregue, en la web y en PDF.',
      ],
      [
        'Qué no es el servicio',
        'No es consejo legal y no sustituye el consejo de un abogado. No somos un bufete de abogados, nadie aquí actúa como su abogado, y comprar una revisión no crea una relación abogado-cliente ni privilegio alguno. No preparamos, seleccionamos ni presentamos documentos judiciales, y nunca le decimos a usted o a su ser querido qué presentar. Las fechas o plazos en un informe son aritmética a partir de las fechas que usted nos dio y las fechas del expediente; solo un abogado puede verificar un plazo.',
      ],
      [
        'No se promete ningún resultado',
        'No podemos prometer alivio, libertad ni ningún resultado judicial. Prometemos una lectura cuidadosa y citada de lo que hay en el expediente — y que si no encontramos nada, el informe lo dice claramente.',
      ],
      [
        'Precio y alcance',
        '$299 cubre todo hasta 5,000 páginas. Las páginas adicionales cuestan $49 por cada 2,500, y preguntamos primero. Ejecutar el análisis otra vez después, con documentos nuevos, cuesta $99. El audio y el video no están incluidos. Subir documentos es gratis e ilimitado antes de que empiece la revisión; la revisión se ejecuta una vez, cuando usted nos dice que sus documentos están completos.',
      ],
      [
        'Reembolsos',
        'Si no podemos leer sus documentos, nos detenemos antes de analizar y usted decide: subirlos de nuevo o un reembolso. La política de reembolso completa está en su propia página.',
      ],
      [
        'Sus documentos y sus datos',
        'Usted confirma que tiene derecho a poseer los documentos que sube. Sus documentos están cifrados, solo los ve nuestro personal de revisión, se guardan 12 meses y se borran antes si usted lo pide. Puede descargar todo lo que subió en cualquier momento. Los detalles están en nuestra página de Privacidad.',
      ],
      [
        'Compartir el informe',
        'Usted decide quién ve su informe. Un enlace para compartir la Parte B vence en 30 días y usted puede apagarlo en cualquier momento; el consentimiento para compartir con una clínica está apagado hasta que usted lo encienda. Compartir un informe con un abogado o una clínica no los convierte por sí solo en su abogado ni crea privilegio.',
      ],
      [
        'Su cuenta',
        'Guarde su contraseña para usted; usted es responsable de lo que ocurra con su inicio de sesión. Puede cambiar su correo, cambiar su contraseña o pedirnos que borremos su cuenta desde la página de su cuenta.',
      ],
      [
        'Preguntas y disputas',
        'Escriba primero a admin@snotnoselegal.com — una persona lee cada mensaje, y la mayoría de las cosas se resuelven ahí. Donde estos términos no digan nada, se aplica la ley de Texas. La versión en inglés de estos términos es la que rige.',
      ],
    ] as [string, string][],
    related: 'Páginas relacionadas: la Política de reembolso, nuestras Divulgaciones y la página de Privacidad.',
  },
}
