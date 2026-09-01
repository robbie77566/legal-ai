/** Bilingual landing content (i18n_localization.md R7): every change
 * updates BOTH languages; the parity test enforces structure. */
export const LANDING_CONTENT = {
  en: {
    cta: 'See if this fits your case — free, 2 minutes',
    ctaNav: 'See if this fits — free',
    ctaSticky: 'Free 2-minute check',
    heroTitle: 'Find out what’s really in the court record — before you spend thousands.',
    heroBody:
      'World-class AI, built for one job: reviewing Texas convictions after the trial is over. It reads every page of your loved one’s trial record, screens it for the problems that win appeals and writs (a writ is a formal request asking the court to take another look), and backs every finding with the exact page and quote — explained in plain English. ',
    heroPrice: '$299. One price, no per-page fees.',
    heroSub: 'Free 2-minute check · Not a law firm · Information, not legal advice',
    problem:
      'A lawyer charges about $3,000 just to read the file and tell you if a writ is worth pursuing. Full representation runs $15,000 or more. Most families decide blind — or don’t decide at all.',
    howTitle: 'How it works',
    steps: [
      'Answer a few questions (free).',
      'Send the court documents — we show you how to get every one, step by step, and you can upload photos taken with your phone.',
      'Get your report: plain-English findings plus a packet any lawyer can use.',
    ],
    guideLink: 'Read the free guide: how to get each document, what it looks like, and what it costs',
    howNote: 'Most reviews are ready within 10 business days of your documents being complete.',
    checksTitle: 'What we look for',
    checks: [
      'Mistakes the trial lawyer may have made',
      'Evidence the State didn’t turn over',
      'Forensic science that’s since been discredited',
      'Sentence and jail-time-credit errors',
      'Deadlines that still matter — including "if the lawyer never filed the appeal you asked for, that itself can be a claim"',
    ],
    checksCite: 'Backed by page-and-line citations you can verify.',
    checksNote: 'Powered by careful AI analysis — and checked by a person, every time.',
    reportTitle: 'Your report, two parts',
    reportBody1a: 'Part A is for you:',
    reportBody1b:
      ' what we reviewed, what we found, what it means, and what to do next — in plain English. ',
    reportBody1c: 'Part B is for your lawyer:',
    reportBody1d:
      ' every finding with volume, page, and line citations, a timeline, and source excerpts.',
    reportBody2:
      'Whatever we find — including nothing — we tell you straight, and there is always a next step.',
    priceUnit: '· one price',
    priceItems: [
      'Up to 5,000 pages',
      'All five checks',
      'Human review of every report',
      'Both report parts, yours to keep',
      'Secure handling, deleted on request',
    ],
    priceNote:
      'More pages: $49 per additional 2,500 — we ask first, never surprise you. Re-run with new documents: $99. For comparison: an attorney review runs ~$3,000; medical second opinions $975–$2,000.',
    refundNote:
      'Refund policy: if we can’t read your records, we tell you before we analyze — and you choose re-upload or refund.',
    fitTitle: 'This is not for every case',
    fitYesLabel: 'Fits:',
    fitYes:
      ' a Texas felony conviction, the appeal decided (or never filed), and a family ready to gather the documents.',
    fitNoLabel: 'Not for:',
    fitNo:
      ' death-penalty cases (you have a right to appointed counsel), cases still on direct appeal (come back after it’s decided), or out-of-state and federal convictions.',
    faqTitle: 'Questions families ask',
    faq: [
      [
        'Is this legal advice?',
        'No. This is a detailed review of court records — information to help you and a lawyer decide what to do next. We are not a law firm, and no attorney-client relationship is created. We never recommend filing anything on your own; a report is something to take to a lawyer.',
      ],
      [
        "Couldn't I just paste the record into ChatGPT?",
        "You could — and for a decision this final, you shouldn't. A general chatbot wasn't built for this: a trial record runs hundreds or thousands of pages (most tools can't even hold it all), and when a chatbot is unsure, it can confidently make things up — with no way for you to tell. Our system is engineered for exactly this job: it analyzes your complete record in multiple specialized passes built around Texas post-conviction law, and it is forbidden by design from showing you anything it can't back with an exact quote from your documents. In Texas, the first writ is effectively the only writ. That's not a job for a general-purpose chatbot.",
      ],
      [
        'What if the news is bad?',
        'We tell you straight, with dignity, and there is always a next step — whatever we find, including nothing.',
      ],
      [
        "What documents do I need — and what if I can't get them?",
        'After you buy, a short interview builds your personal checklist, and every item comes with "here’s how to get it" guidance. If there was a direct appeal, the trial transcript usually already exists. Our free guide explains each document, what it looks like, and what it costs.',
      ],
      [
        'Who sees our records?',
        'Your records are encrypted, seen only by our review team, kept 12 months, and deleted sooner on request.',
      ],
      [
        'How long does it take?',
        'Your review clock starts when your documents are complete — we tell you the moment that happens, and we email you at every step.',
      ],
      [
        '¿Está disponible en español?',
        'Sí — toque «Español» arriba y todo el sitio cambia de idioma. Su reporte se entrega en inglés por ahora; la versión en español viene pronto.',
      ],
    ] as [string, string][],
    footerLegal:
      'Family Case Review is a service of Snot Nose Legal. Snot Nose Legal is not a law firm and does not provide legal advice. Reports are information about court records, prepared with AI assistance and reviewed by trained staff, for use in consultation with a licensed attorney.',
    staffSignIn: 'Staff sign in',
  },
  es: {
    cta: 'Vea si aplica a su caso — gratis, 2 minutos',
    ctaNav: 'Vea si aplica — gratis',
    ctaSticky: 'Revisión gratis de 2 minutos',
    heroTitle: 'Descubra lo que realmente dice el expediente — antes de gastar miles de dólares.',
    heroBody:
      'Inteligencia artificial de clase mundial, creada para una sola tarea: revisar condenas de Texas después del juicio. Lee cada página del expediente de su ser querido, busca los problemas que ganan apelaciones y recursos legales (un "writ" es una petición formal para que la corte revise el caso de nuevo), y respalda cada hallazgo con la página y la cita exacta — explicado en palabras sencillas. ',
    heroPrice: '$299. Un solo precio, sin cargos por página.',
    heroSub:
      'Revisión gratis de 2 minutos · No somos un bufete de abogados · Información, no consejo legal',
    problem:
      'Un abogado cobra unos $3,000 solo por leer el expediente y decirle si vale la pena presentar un recurso. La representación completa cuesta $15,000 o más. La mayoría de las familias deciden a ciegas — o no deciden nada.',
    howTitle: 'Cómo funciona',
    steps: [
      'Conteste unas preguntas (gratis).',
      'Envíe los documentos de la corte — le enseñamos cómo conseguir cada uno, paso a paso, y puede subir fotos tomadas con su teléfono.',
      'Reciba su reporte: hallazgos en palabras sencillas, más un paquete que cualquier abogado puede usar.',
    ],
    guideLink: 'Lea la guía gratis: cómo conseguir cada documento, cómo se ve y cuánto cuesta',
    howNote:
      'La mayoría de los reportes están listos dentro de 10 días hábiles después de completar sus documentos.',
    checksTitle: 'Qué buscamos',
    checks: [
      'Errores que pudo haber cometido el abogado del juicio',
      'Pruebas que la Fiscalía no entregó',
      'Ciencia forense que ya fue desacreditada',
      'Errores en la sentencia y en el crédito por tiempo en la cárcel',
      'Plazos que todavía importan — incluyendo "si el abogado nunca presentó la apelación que usted pidió, eso mismo puede ser un reclamo"',
    ],
    checksCite: 'Respaldado con citas de página y línea que usted puede verificar.',
    checksNote:
      'Con análisis cuidadoso de inteligencia artificial — y revisado por una persona, siempre.',
    reportTitle: 'Su reporte, en dos partes',
    reportBody1a: 'La Parte A es para usted:',
    reportBody1b:
      ' qué revisamos, qué encontramos, qué significa y qué hacer después — en palabras sencillas. ',
    reportBody1c: 'La Parte B es para su abogado:',
    reportBody1d:
      ' cada hallazgo con citas de tomo, página y línea, una cronología y extractos del expediente.',
    reportBody2:
      'Encontremos lo que encontremos — incluso nada — se lo decimos con franqueza, y siempre hay un siguiente paso.',
    priceUnit: '· un solo precio',
    priceItems: [
      'Hasta 5,000 páginas',
      'Las cinco revisiones completas',
      'Revisión humana de cada reporte',
      'Las dos partes del reporte, suyas para siempre',
      'Manejo seguro; se borra si usted lo pide',
    ],
    priceNote:
      'Páginas adicionales: $49 por cada 2,500 — le preguntamos primero, nunca hay sorpresas. Repetir la revisión con documentos nuevos: $99. Para comparar: una revisión de abogado cuesta ~$3,000; una segunda opinión médica, $975–$2,000.',
    refundNote:
      'Política de reembolso: si no podemos leer sus documentos, se lo decimos antes de analizar — y usted decide entre subirlos de nuevo o recibir su reembolso.',
    fitTitle: 'Esto no es para todos los casos',
    fitYesLabel: 'Aplica:',
    fitYes:
      ' una condena por delito grave en Texas, con la apelación ya decidida (o nunca presentada), y una familia lista para reunir los documentos.',
    fitNoLabel: 'No aplica:',
    fitNo:
      ' casos de pena de muerte (usted tiene derecho a un abogado designado), casos todavía en apelación directa (vuelva cuando se decida), o condenas federales o de otros estados.',
    faqTitle: 'Preguntas que hacen las familias',
    faq: [
      [
        '¿Esto es consejo legal?',
        'No. Es una revisión detallada de documentos de la corte — información para que usted y un abogado decidan qué hacer. No somos un bufete y no se crea una relación abogado-cliente. Nunca recomendamos presentar nada por su cuenta; el reporte es para llevárselo a un abogado.',
      ],
      [
        '¿No podría simplemente pegar el expediente en ChatGPT?',
        'Podría — y para una decisión tan definitiva, no debería. Un chatbot general no fue creado para esto: un expediente tiene cientos o miles de páginas (la mayoría de esas herramientas ni siquiera pueden leerlo completo), y cuando un chatbot no está seguro, puede inventar cosas con total confianza — sin que usted pueda darse cuenta. Nuestro sistema fue diseñado exactamente para esta tarea: analiza su expediente completo en varias pasadas especializadas en la ley de Texas, y tiene prohibido por diseño mostrarle algo que no pueda respaldar con una cita exacta de sus documentos. En Texas, el primer recurso es prácticamente el único. Eso no es trabajo para un chatbot de uso general.',
      ],
      [
        '¿Y si las noticias son malas?',
        'Se lo decimos con franqueza y con dignidad, y siempre hay un siguiente paso — encontremos lo que encontremos, incluso nada.',
      ],
      [
        '¿Qué documentos necesito — y qué pasa si no los puedo conseguir?',
        'Después de comprar, una entrevista corta crea su lista personal de documentos, y cada uno viene con instrucciones de "así se consigue". Si hubo apelación directa, la transcripción del juicio normalmente ya existe. Nuestra guía gratis explica cada documento, cómo se ve y cuánto cuesta.',
      ],
      [
        '¿Quién ve nuestros documentos?',
        'Sus documentos están cifrados, solo los ve nuestro equipo de revisión, se guardan 12 meses y se borran antes si usted lo pide.',
      ],
      [
        '¿Cuánto tiempo tarda?',
        'El reloj de su revisión empieza cuando sus documentos están completos — le avisamos en ese momento y le escribimos por correo en cada paso.',
      ],
      [
        'Is this available in English?',
        'Yes — tap "English" above and the whole site switches. Reports are delivered in English today.',
      ],
    ] as [string, string][],
    footerLegal:
      'Family Case Review es un servicio de Snot Nose Legal. Snot Nose Legal no es un bufete de abogados y no da consejo legal. Los reportes son información sobre documentos de la corte, preparados con ayuda de inteligencia artificial y revisados por personal capacitado, para usarse en consulta con un abogado con licencia.',
    staffSignIn: 'Acceso para el personal',
  },
}
