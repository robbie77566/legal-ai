/**
 * Sample report (snotnoselegal_site_design.md §3): a Part A built from a
 * FICTIONAL case so families see exactly what $299 buys. Every name, cause
 * number, and quote is invented (the John Fixture synthetic corpus) — the
 * banner says so on the page. Mirrors the real report page's structure:
 * findings with mono citations and a collapsible Part B.
 *
 * Register (UPL review 2026-10-23, F2): every line DESCRIBES the record —
 * "the record shows X at page Y; a lawyer would want to see this". Nothing
 * here argues, weighs a claim, names what attaches, or recommends a step.
 * In the one-batch counsel review queue (runbook, 2026-09-02).
 */
export const SAMPLE_REPORT_CONTENT = {
  en: {
    banner:
      'This is a SAMPLE built from a fictional case ("State v. John Fixture") so you can see exactly what a real report looks like. Every name, number, and quote below is invented.',
    title: 'Sample report — State v. John Fixture',
    intro:
      'A real report opens with what the review found, in plain words. For this fictional case it would read: the record shows two things a lawyer would want to see, and one more to show them.',
    strongTitle: 'What the record shows',
    strongIntro: 'Each finding quotes the record, page and line.',
    strong: [
      {
        partA:
          'Your loved one told his trial lawyer about a witness who could support his alibi — and the record shows the lawyer never contacted her. At trial, the State told the jury no one could back up his story. A lawyer would want to see this.',
        cite: 'Reporter’s Record Vol. 4, p. 212: “Q: Did you ever attempt to contact Ms. Alvarez? A: I did not, no.”',
        partB:
          'The record shows trial counsel testifying that he made no attempt to contact the alibi witness (RR4:212) whom the defendant had identified before trial (RR2:88), and the State telling the jury in closing that “not one person came here to say he was elsewhere” (RR5:301). Category: assistance of counsel — investigation.',
      },
      {
        partA:
          'A lab worker testified that her notes were kept in the State’s working file and never given to the defense. The record does not show what was in those notes. A lawyer would want to see this.',
        cite: 'Reporter’s Record Vol. 3, p. 145: “We kept those in our working file. They weren’t produced to anybody.”',
        partB:
          'The record shows the analyst testifying that her bench notes were kept in the State’s working file and were not produced (RR3:145). The notes themselves are not in this record, so what they contained is not known from it. Category: disclosure by the State.',
      },
    ],
    reviewTitle: 'Also in the record',
    review: [
      {
        partA:
          'The jury heard an expert compare a bite mark to your loved one. Since this trial, scientists have questioned this kind of comparison. Texas has a law about convictions built on science that has changed since the trial — a lawyer would want to see this.',
        cite: 'Reporter’s Record Vol. 4, p. 233: “In my opinion the dentition is consistent with the defendant to a reasonable degree of certainty.”',
        partB:
          'The record shows bite-mark comparison testimony presented as identifying the defendant (RR4:233) and referred to twice in the State’s closing (RR5:298, 305). The standing of that field has changed since the trial. Category: changed science (the rule is Article 11.073).',
      },
    ],
    deadlineTitle: 'Where the clock stands',
    deadlineBody:
      'A real report also shows the time-limit picture: the dates from the record and the dates you gave us, the rule each time limit follows, and the arithmetic from those dates — for a lawyer to verify.',
    nothingTitle: 'And when we find nothing?',
    nothingBody:
      'Some reviews end with no findings. That report says so plainly and shows what we checked. An honest "nothing found" is information too — we treat it with the same care, and the next step is the same: take it to a lawyer.',
    ctaLead: 'This is what $299 buys — for your loved one’s real record.',
    cta: 'Start the free check',
  },
  es: {
    banner:
      'Esto es una MUESTRA construida con un caso ficticio ("State v. John Fixture") para que vea exactamente cómo es un informe real. Cada nombre, número y cita aquí abajo es inventado.',
    title: 'Informe de muestra — State v. John Fixture',
    intro:
      'Un informe real empieza con lo que la revisión encontró, en palabras sencillas. Para este caso ficticio diría: el expediente muestra dos cosas que un abogado querría ver, y una más para mostrarle.',
    strongTitle: 'Lo que muestra el expediente',
    strongIntro: 'Cada hallazgo cita el expediente, página y línea.',
    strong: [
      {
        partA:
          'Su ser querido le contó a su abogado sobre una testigo que podía apoyar su coartada — y el expediente muestra que el abogado nunca la contactó. En el juicio, el Estado le dijo al jurado que nadie podía respaldar su historia. Un abogado querría ver esto.',
        cite: 'Reporter’s Record Vol. 4, p. 212: “Q: Did you ever attempt to contact Ms. Alvarez? A: I did not, no.”',
        partB:
          'El expediente muestra al abogado del juicio declarando que no intentó contactar a la testigo de coartada (RR4:212) que el acusado había identificado antes del juicio (RR2:88), y al Estado diciendo al jurado en el cierre que “ni una sola persona vino a decir que él estaba en otro lugar” (RR5:301). Categoría: asistencia del abogado — investigación.',
      },
      {
        partA:
          'Una trabajadora del laboratorio testificó que sus notas se quedaron en el archivo del Estado y nunca se entregaron a la defensa. El expediente no muestra qué había en esas notas. Un abogado querría ver esto.',
        cite: 'Reporter’s Record Vol. 3, p. 145: “We kept those in our working file. They weren’t produced to anybody.”',
        partB:
          'El expediente muestra a la analista declarando que sus notas de laboratorio se quedaron en el archivo de trabajo del Estado y no se entregaron (RR3:145). Las notas mismas no están en este expediente, así que lo que contenían no se sabe a partir de él. Categoría: entrega de evidencia por el Estado.',
      },
    ],
    reviewTitle: 'También en el expediente',
    review: [
      {
        partA:
          'El jurado escuchó a un experto comparar una marca de mordida con su ser querido. Desde este juicio, los científicos han cuestionado este tipo de comparación. Texas tiene una ley sobre condenas construidas sobre ciencia que ha cambiado desde el juicio — un abogado querría ver esto.',
        cite: 'Reporter’s Record Vol. 4, p. 233: “In my opinion the dentition is consistent with the defendant to a reasonable degree of certainty.”',
        partB:
          'El expediente muestra testimonio de comparación de mordida presentado como identificación del acusado (RR4:233) y mencionado dos veces en el cierre del Estado (RR5:298, 305). La posición de ese campo ha cambiado desde el juicio. Categoría: ciencia que ha cambiado (la regla es el Artículo 11.073).',
      },
    ],
    deadlineTitle: 'Dónde está el reloj',
    deadlineBody:
      'Un informe real también muestra el panorama de plazos: las fechas del expediente y las fechas que usted nos dio, la regla que sigue cada plazo, y la aritmética a partir de esas fechas — para que un abogado la verifique.',
    nothingTitle: '¿Y cuando no encontramos nada?',
    nothingBody:
      'Algunas revisiones terminan sin hallazgos. Ese informe lo dice claramente y muestra qué verificamos. Un honesto "no se encontró nada" también es información — la tratamos con el mismo cuidado, y el siguiente paso es el mismo: llevárselo a un abogado.',
    ctaLead: 'Esto es lo que compran los $299 — para el expediente real de su ser querido.',
    cta: 'Empiece la revisión gratis',
  },
}
