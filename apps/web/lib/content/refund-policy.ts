import { NOT_A_LAW_FIRM } from '@hg/case-lifecycle'

/**
 * Refund policy (landing_page_spec.md §4.5 and §5; UPL review 2026-10-23,
 * rec 10). DRAFT — the promise the buy cards and the landing already make,
 * written out in full, in the Daybreak voice, both languages.
 */
export const REFUND_POLICY_CONTENT = {
  en: {
    draft: 'DRAFT — pending review by licensed counsel. Not yet effective.',
    title: 'Refund policy',
    intro:
      'One price, no per-page fees, and no surprises on the way out either. Here is exactly when money comes back, how much, and how.',
    statement: NOT_A_LAW_FIRM.en,
    sections: [
      [
        'If we cannot read your records',
        'Before any analysis starts, every page is turned into text and checked. If too many pages are too hard to read, we stop and tell you — and you choose: upload cleaner copies, or take a full refund of the $299. Nothing is analyzed, and nothing is charged for the attempt.',
      ],
      [
        'If we cannot deliver part of what you paid for',
        'If a problem on our side means part of a review cannot be delivered, we refund that part and the rest of your review continues. We say what the refund covers, in plain words, in the email that confirms it.',
      ],
      [
        'What a refund does not depend on',
        'A refund never depends on what the report finds. A report that finds nothing is a complete review — it says what we checked and that the specific problems we look for did not show in this record. That result is not a defect, and it is not refundable on its own.',
      ],
      [
        'Extra pages and re-runs',
        'The $49 charge for additional pages is asked for before it is charged and refunded like the review if the pages cannot be read. The $99 re-run with new documents follows the same rules as a review.',
      ],
      [
        'Changing your mind',
        'Before your records are marked complete, write to us and we will refund the $299 in full — uploading is free, and nothing has been spent on your behalf. After the review has started, the rules above apply.',
      ],
      [
        'How and when',
        'Refunds go back to the card you paid with and usually appear in 5–10 business days, depending on your bank. Every refund is confirmed by email, and your account page lists it. Any report you already received stays available to you.',
      ],
      [
        'How to ask',
        'Reply to any email from us, or write to admin@snotnoselegal.com. A person reads it and answers within two business days, usually sooner.',
      ],
    ] as [string, string][],
    related: 'Related pages: the Terms of service, our Disclosures, and the Privacy page.',
  },
  es: {
    draft: 'BORRADOR — pendiente de revisión por un abogado con licencia. Todavía no está en vigor.',
    title: 'Política de reembolso',
    intro:
      'Un solo precio, sin cargos por página, y sin sorpresas tampoco a la salida. Aquí está exactamente cuándo se devuelve el dinero, cuánto y cómo.',
    statement: NOT_A_LAW_FIRM.es,
    sections: [
      [
        'Si no podemos leer sus documentos',
        'Antes de que empiece cualquier análisis, cada página se convierte en texto y se verifica. Si demasiadas páginas son demasiado difíciles de leer, nos detenemos y se lo decimos — y usted decide: subir copias más limpias, o recibir un reembolso completo de los $299. No se analiza nada y no se cobra nada por el intento.',
      ],
      [
        'Si no podemos entregar parte de lo que pagó',
        'Si un problema de nuestro lado impide entregar parte de una revisión, reembolsamos esa parte y el resto de su revisión continúa. Decimos qué cubre el reembolso, en palabras sencillas, en el correo que lo confirma.',
      ],
      [
        'De qué no depende un reembolso',
        'Un reembolso nunca depende de lo que encuentre el informe. Un informe que no encuentra nada es una revisión completa — dice qué verificamos y que los problemas específicos que buscamos no aparecieron en este expediente. Ese resultado no es un defecto, y no es reembolsable por sí solo.',
      ],
      [
        'Páginas adicionales y repeticiones',
        'El cargo de $49 por páginas adicionales se pregunta antes de cobrarse y se reembolsa como la revisión si las páginas no se pueden leer. La repetición de $99 con documentos nuevos sigue las mismas reglas que una revisión.',
      ],
      [
        'Si cambia de opinión',
        'Antes de que sus documentos se marquen como completos, escríbanos y le reembolsaremos los $299 completos — subir es gratis, y no se ha gastado nada en su nombre. Después de que la revisión haya empezado, se aplican las reglas de arriba.',
      ],
      [
        'Cómo y cuándo',
        'Los reembolsos regresan a la tarjeta con la que pagó y normalmente aparecen en 5 a 10 días hábiles, según su banco. Cada reembolso se confirma por correo, y la página de su cuenta lo muestra. Cualquier informe que ya haya recibido sigue disponible para usted.',
      ],
      [
        'Cómo pedirlo',
        'Responda a cualquier correo nuestro, o escriba a admin@snotnoselegal.com. Una persona lo lee y responde dentro de dos días hábiles, normalmente antes.',
      ],
    ] as [string, string][],
    related: 'Páginas relacionadas: los Términos del servicio, nuestras Divulgaciones y la página de Privacidad.',
  },
}
