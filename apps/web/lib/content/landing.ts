import { NOT_A_LAW_FIRM, QUALITY_CHECKED } from '@hg/case-lifecycle'

/** Bilingual landing content (i18n_localization.md R7): every change
 * updates BOTH languages; the parity test enforces structure. Voice rule
 * (UPL review 2026-10-23): describe what the software does with the record;
 * never compare it to a lawyer, weigh a claim, or hold anyone out as one. */
export const LANDING_CONTENT = {
  en: {
    cta: 'See if this fits your case — free, 2 minutes',
    ctaNav: 'See if this fits — free',
    signIn: 'Sign in',
    ctaSticky: 'Free 2-minute check',
    heroTitle: 'Find out what’s really in the court record — before you spend thousands.',
    heroBody:
      'AI built for one job: Texas convictions after the trial is over. It reads every page of your loved one’s record, runs six checks for the issues post-conviction law recognises, and shows you only what it can prove with the exact words from the record — page and line. If a quote isn’t really there, it never reaches you. Explained in plain English. ',
    heroPrice: '$299. One price, no per-page fees.',
    heroSub: 'Free 2-minute check · Not a law firm · Information, not legal advice',
    sampleLink: 'See a sample report first',
    whyTitle: 'Why not just upload it to ChatGPT?',
    whyIntro: 'You can. Here is what you would be missing.',
    why: [
      ['ChatGPT reads your files and gives you an answer.', 'We check every answer against your record. If a quote isn’t really there, it’s thrown out before you see it.'],
      ['ChatGPT answers the questions you know to ask.', 'We run six checks for the issues Texas post-conviction law recognises — on every page of the record.'],
      ['ChatGPT can sound sure when it’s wrong — and you can’t tell.', 'Every finding shows the page and the exact words, so you and your lawyer can see it for yourselves.'],
      ['ChatGPT gives you a chat.', 'We give you a report a lawyer can work from — and the deadline math that says how much time is left.'],
    ],
    proof: [
      'Every quote is re-verified word-for-word against your documents before delivery.',
      'The method was evaluated against real Texas cases.',
      'If we find nothing, we say so plainly — we don’t sell hope.',
    ],
    problem:
      'A trial record runs to hundreds or thousands of pages, and most families never see what is in it — they decide blind, or don’t decide at all. Our software reads every page of the record and runs six checks for the issues post-conviction law recognises, so you and a lawyer start from what the record actually says.',
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
      'Jury selection problems',
    ],
    checksCite: 'Backed by page-and-line citations you can verify.',
    checksNote: 'AI built for this job. Quality gates check every report, and anything that looks off goes to a person before it reaches you.',
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
      'All six checks',
      'Quality gates on every report — human review when anything looks off',
      'Both report parts, yours to keep',
      'Secure handling, deleted on request',
    ],
    priceNote:
      'More pages: $49 per additional 2,500 — we ask first, never surprise you. Re-run with new documents: $99.',
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
        "Couldn't I just upload the record to ChatGPT?",
        "You can upload the files — the problem is what happens next. Nothing checks the chatbot's answer against the record, so a made-up quote or a wrong page number looks exactly like a real one, and it only looks for the problems you already know to ask about. Our system runs six checks for the issues Texas post-conviction law recognises, on every page, and every finding must carry the exact words from your record — then each quote is re-checked against the document before you see it. Anything that fails is removed. Texas law strictly limits second writs; that's why the checking matters more than the reading.",
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
        'En parte. Toque «Español» arriba: esta página, el inicio, Cómo funciona, Precio, Aprenda, la guía de documentos, las Preguntas, el informe de muestra, Quiénes somos y Contacto están en español. La revisión gratis, la compra, su cuenta, las páginas de su caso, los correos y el reporte se entregan en inglés por ahora.',
      ],
    ] as [string, string][],
    footerLegal: `${NOT_A_LAW_FIRM.en} Reports are AI-generated content about court records. ${QUALITY_CHECKED.en}`,
    staffSignIn: 'Staff sign in',
  },
  es: {
    cta: 'Vea si aplica a su caso — gratis, 2 minutos',
    ctaNav: 'Vea si aplica — gratis',
    signIn: 'Iniciar sesión',
    ctaSticky: 'Revisión gratis de 2 minutos',
    heroTitle: 'Descubra lo que realmente dice el expediente — antes de gastar miles de dólares.',
    heroBody:
      'Inteligencia artificial creada para una sola tarea: condenas de Texas después del juicio. Lee cada página del expediente de su ser querido, hace seis verificaciones de los problemas que la ley post-condena reconoce, y le muestra solo lo que puede probar con las palabras exactas del expediente — página y línea. Si una cita no está realmente ahí, nunca le llega. Explicado en palabras sencillas. ',
    heroPrice: '$299. Un solo precio, sin cargos por página.',
    heroSub:
      'Revisión gratis de 2 minutos · No somos un bufete de abogados · Información, no consejo legal',
    sampleLink: 'Vea primero un reporte de muestra',
    whyTitle: '¿Por qué no simplemente subirlo a ChatGPT?',
    whyIntro: 'Puede hacerlo. Esto es lo que le faltaría.',
    why: [
      ['ChatGPT lee sus archivos y le da una respuesta.', 'Nosotros verificamos cada respuesta contra su expediente. Si una cita no está realmente ahí, se descarta antes de que usted la vea.'],
      ['ChatGPT responde las preguntas que usted sabe hacer.', 'Nosotros hacemos seis verificaciones de los problemas que la ley post-condena de Texas reconoce — en cada página del expediente.'],
      ['ChatGPT puede sonar seguro cuando está equivocado — y usted no puede notarlo.', 'Cada hallazgo muestra la página y las palabras exactas, para que usted y su abogado lo vean con sus propios ojos.'],
      ['ChatGPT le da una conversación.', 'Nosotros le damos un reporte con el que un abogado puede trabajar — y el cálculo de plazos que dice cuánto tiempo queda.'],
    ],
    proof: [
      'Cada cita se verifica de nuevo palabra por palabra contra sus documentos antes de la entrega.',
      'El método fue evaluado con casos reales de Texas.',
      'Si no encontramos nada, se lo decimos claramente — no vendemos esperanza.',
    ],
    problem:
      'Un expediente de juicio tiene cientos o miles de páginas, y la mayoría de las familias nunca ve lo que contiene — deciden a ciegas, o no deciden nada. Nuestro software lee cada página del expediente y hace seis verificaciones de los problemas que la ley post-condena reconoce, para que usted y un abogado empiecen desde lo que el expediente realmente dice.',
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
      'Problemas en la selección del jurado',
    ],
    checksCite: 'Respaldado con citas de página y línea que usted puede verificar.',
    checksNote:
      'Inteligencia artificial creada para esta tarea. Controles de calidad revisan cada reporte, y cualquier cosa dudosa pasa por una persona antes de llegarle.',
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
      'Las seis revisiones completas',
      'Controles de calidad en cada reporte — revisión humana cuando algo parece dudoso',
      'Las dos partes del reporte, suyas para siempre',
      'Manejo seguro; se borra si usted lo pide',
    ],
    priceNote:
      'Páginas adicionales: $49 por cada 2,500 — le preguntamos primero, nunca hay sorpresas. Repetir la revisión con documentos nuevos: $99.',
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
        '¿No podría simplemente subir el expediente a ChatGPT?',
        'Puede subir los archivos — el problema es lo que pasa después. Nada verifica la respuesta del chatbot contra el expediente, así que una cita inventada o un número de página equivocado se ve igual que uno real, y solo busca los problemas que usted ya sabe preguntar. Nuestro sistema hace seis verificaciones de los problemas que la ley post-condena de Texas reconoce, en cada página, y cada hallazgo debe llevar las palabras exactas de su expediente — después, cada cita se verifica de nuevo contra el documento antes de que usted la vea. Lo que falla se elimina. La ley de Texas limita fuertemente los segundos recursos; por eso la verificación importa más que la lectura.',
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
        'Yes — tap "English" above. This page, the home page, How it works, Pricing, Learn, the documents guide, the FAQ, the sample report, About and Contact are in both languages. The free check, the purchase, your account, your case pages, the emails and the report are in English today.',
      ],
    ] as [string, string][],
    footerLegal: `${NOT_A_LAW_FIRM.es} Los reportes son contenido generado por inteligencia artificial sobre expedientes judiciales. ${QUALITY_CHECKED.es}`,
    staffSignIn: 'Acceso para el personal',
  },
}
