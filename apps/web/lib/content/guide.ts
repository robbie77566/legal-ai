/** Bilingual documents-guide content (i18n_localization.md). */
export const GUIDE_CONTENT = {
  en: {
    title: 'How to get your loved one’s court documents',
    intro:
      'You do not need a lawyer to get these. Almost everything comes from one office: the district clerk of the county where the trial happened. This guide tells you what each document is, what it looks like, how to ask for it, and about how much it costs.',
    formatsTitle: 'What we can accept (file formats)',
    formats: [
      'PDF files — what the clerk usually emails you, or what a scanner makes.',
      'Photos from your phone — JPG or PNG, and iPhone photos (HEIC) work too. Take one photo per page, from straight above, with all four corners of the page visible. Good light, no shadows from your hand.',
      'You can upload several files at once, in any order, at your own pace. Big files can take a few minutes on cell service — keep the page open.',
    ],
    clerkTitle: 'The one phone call that gets most of it',
    clerkIntro:
      'Find the district clerk’s phone number: search "[county name] county district clerk Texas" — the number is on the county website. Then say something like:',
    script:
      '"Hello — I’m calling about a criminal case. The defendant’s name is ______ and the cause number is ______ (if you don’t know the cause number, give the name and the approximate year). I’d like to get a copy of the judgment and sentence, the indictment, and the case file. What does that cost, and can you email it or mail it?"',
    clerkNote:
      'Copies usually cost about $1 per page; a "certified" copy (with an official stamp) costs a little more per document. Many counties can email PDFs. For cases from 2016 or later, some records are online at re:SearchTX (research.txcourts.gov).',
    docsTitle: 'The documents, one by one',
    docs: [
      {
        name: 'Judgment and sentence',
        what: 'The official paper that says what the conviction was and what the punishment is. Usually 2–6 pages with the judge’s signature.',
        looks: 'A form titled "Judgment of Conviction" — it lists the offense, the plea, the sentence in years, and credit for time already served.',
        how: 'District clerk. Ask for a certified copy (about $1 per page plus a small certification fee).',
      },
      {
        name: 'Indictment',
        what: 'The paper that formally charged your loved one with the crime. Usually 1–2 pages.',
        looks: 'Starts with "IN THE NAME AND BY AUTHORITY OF THE STATE OF TEXAS" — old-fashioned legal wording, often with a grand jury stamp.',
        how: 'District clerk — it is in the same case file.',
      },
      {
        name: 'Reporter’s record (the trial transcript)',
        what: 'Word-for-word everything said in court, typed by the court reporter. This is the most important set — often several numbered volumes, hundreds of pages each.',
        looks: 'Volumes labeled "Reporter’s Record, Volume 1 of 8" with a cover page listing the case, the court, and the court reporter’s name. Inside, numbered lines of testimony, like a movie script.',
        how: 'IMPORTANT: if there was an appeal, this transcript already exists — ask the district clerk or the court of appeals for it before paying a court reporter to make a new one (new transcripts can cost thousands; existing copies cost normal copy fees).',
      },
      {
        name: 'Clerk’s record',
        what: 'The folder of everything filed on paper in the case: motions, orders, jury instructions, the docket sheet.',
        looks: 'A thick stack (or PDF) with an index at the front listing every filing by date.',
        how: 'District clerk — ask for "the clerk’s record" or "the case file." For 2016-and-later cases, check re:SearchTX first; it may be free to view.',
      },
      {
        name: 'Appellate opinion (only if there was an appeal)',
        what: 'The appeals court’s written decision. Usually 5–30 pages.',
        looks: 'Starts with the court’s name ("In the Court of Appeals…"), the case number, and ends with "AFFIRMED" or similar.',
        how: 'Free: search the case number on the court of appeals website, or ask that court’s clerk.',
      },
      {
        name: 'Plea papers (if there was a plea deal instead of a trial)',
        what: 'The forms your loved one signed to plead guilty: the agreement, the warnings (called "admonishments"), and the confession.',
        looks: 'A packet of forms with initials and signatures on most pages.',
        how: 'District clerk — ask for "the plea paperwork" in the case file.',
      },
    ],
    cantTitle: 'If you get stuck',
    cant:
      'If the clerk says they can’t find something, ask them to check under the cause number AND the full legal name. If a document truly can’t be found, that’s okay — send us what you have. Your checklist inside the service marks what matters most for your case, and every item has this same guidance built in.',
    cta: 'Start the free 2-minute check',
    back: 'Back to the home page',
  },
  es: {
    title: 'Cómo conseguir los documentos de la corte de su ser querido',
    intro:
      'No necesita un abogado para conseguirlos. Casi todo viene de una sola oficina: el secretario del distrito (district clerk) del condado donde fue el juicio. Esta guía le dice qué es cada documento, cómo se ve, cómo pedirlo y cuánto cuesta más o menos.',
    formatsTitle: 'Qué formatos aceptamos (tipos de archivo)',
    formats: [
      'Archivos PDF — lo que el secretario normalmente manda por correo electrónico, o lo que produce un escáner.',
      'Fotos con su teléfono — JPG o PNG, y las fotos de iPhone (HEIC) también sirven. Tome una foto por página, desde arriba, con las cuatro esquinas de la página visibles. Con buena luz y sin sombras de su mano.',
      'Puede subir varios archivos a la vez, en cualquier orden, a su propio ritmo. Los archivos grandes pueden tardar unos minutos con datos móviles — mantenga la página abierta.',
    ],
    clerkTitle: 'La llamada que consigue casi todo',
    clerkIntro:
      'Busque el teléfono del secretario del distrito: busque en internet "[nombre del condado] county district clerk Texas" — el número está en la página del condado. Luego diga algo así (puede pedir si alguien habla español; muchas oficinas tienen personal bilingüe):',
    script:
      '"Hola — llamo por un caso criminal. El nombre del acusado es ______ y el número de causa es ______ (si no sabe el número de causa, dé el nombre y el año aproximado). Quisiera una copia del judgment and sentence, el indictment y el expediente del caso. ¿Cuánto cuesta, y lo pueden mandar por correo electrónico o por correo?"',
    clerkNote:
      'Las copias normalmente cuestan como $1 por página; una copia "certificada" (con sello oficial) cuesta un poco más por documento. Muchos condados mandan PDFs por correo electrónico. Para casos de 2016 en adelante, algunos expedientes están en línea en re:SearchTX (research.txcourts.gov).',
    docsTitle: 'Los documentos, uno por uno',
    docs: [
      {
        name: 'Judgment and sentence (la sentencia)',
        what: 'El papel oficial que dice cuál fue la condena y cuál es el castigo. Normalmente de 2 a 6 páginas con la firma del juez.',
        looks: 'Un formulario titulado "Judgment of Conviction" — indica el delito, la declaración, la condena en años y el crédito por tiempo ya cumplido.',
        how: 'Con el secretario del distrito. Pida una copia certificada (como $1 por página más una pequeña cuota de certificación).',
      },
      {
        name: 'Indictment (la acusación formal)',
        what: 'El papel que acusó formalmente a su ser querido del delito. Normalmente 1 o 2 páginas.',
        looks: 'Empieza con "IN THE NAME AND BY AUTHORITY OF THE STATE OF TEXAS" — lenguaje legal antiguo, muchas veces con el sello del gran jurado.',
        how: 'Con el secretario del distrito — está en el mismo expediente.',
      },
      {
        name: 'Reporter’s record (la transcripción del juicio)',
        what: 'Palabra por palabra, todo lo que se dijo en la corte, escrito por el taquígrafo. Es el conjunto más importante — muchas veces varios tomos numerados, de cientos de páginas cada uno.',
        looks: 'Tomos marcados "Reporter’s Record, Volume 1 of 8" con una portada que indica el caso, la corte y el nombre del taquígrafo. Adentro, líneas numeradas de testimonio, como el guion de una película.',
        how: 'IMPORTANTE: si hubo apelación, esta transcripción ya existe — pídala al secretario del distrito o a la corte de apelaciones antes de pagarle a un taquígrafo por una nueva (una transcripción nueva puede costar miles; las copias existentes cuestan la tarifa normal de copias).',
      },
      {
        name: 'Clerk’s record (el expediente del secretario)',
        what: 'La carpeta con todo lo que se presentó por escrito en el caso: mociones, órdenes, instrucciones al jurado, la lista de actuaciones.',
        looks: 'Un montón grueso de papeles (o un PDF) con un índice al frente que enumera cada documento por fecha.',
        how: 'Con el secretario del distrito — pida "the clerk’s record" o "the case file". Para casos de 2016 en adelante, revise primero re:SearchTX; puede ser gratis verlo.',
      },
      {
        name: 'Appellate opinion (solo si hubo apelación)',
        what: 'La decisión escrita de la corte de apelaciones. Normalmente de 5 a 30 páginas.',
        looks: 'Empieza con el nombre de la corte ("In the Court of Appeals…"), el número del caso, y termina con "AFFIRMED" o algo similar.',
        how: 'Gratis: busque el número del caso en la página de la corte de apelaciones, o pregunte al secretario de esa corte.',
      },
      {
        name: 'Plea papers (si hubo un acuerdo en vez de juicio)',
        what: 'Los formularios que su ser querido firmó para declararse culpable: el acuerdo, las advertencias (llamadas "admonishments") y la confesión.',
        looks: 'Un paquete de formularios con iniciales y firmas en casi todas las páginas.',
        how: 'Con el secretario del distrito — pida "the plea paperwork" del expediente.',
      },
    ],
    cantTitle: 'Si se atora',
    cant:
      'Si el secretario dice que no encuentra algo, pídale que busque por el número de causa Y por el nombre legal completo. Si de verdad no se puede encontrar un documento, no pasa nada — mándenos lo que tenga. Su lista de documentos dentro del servicio marca qué es lo más importante para su caso, y cada documento trae esta misma guía integrada.',
    cta: 'Empiece la revisión gratis de 2 minutos',
    back: 'Volver a la página principal',
  },
}
