/**
 * Sample report (snotnoselegal_site_design.md §3): a Part A built from a
 * FICTIONAL case so families see exactly what $299 buys. Every name, cause
 * number, and quote is invented (the John Fixture synthetic corpus) — the
 * banner says so on the page. Mirrors the real report page's structure:
 * strong signals / worth a closer look, mono citations, collapsible Part B.
 * In the one-batch counsel review queue (runbook, 2026-09-02).
 */
export const SAMPLE_REPORT_CONTENT = {
  en: {
    banner:
      'This is a SAMPLE built from a fictional case ("State v. John Fixture") so you can see exactly what a real report looks like. Every name, number, and quote below is invented.',
    title: 'Sample report — State v. John Fixture',
    intro:
      'A real report opens with the bottom line, in plain words. For this fictional case it would read: we found two things a lawyer would want to see soon, and one more worth a closer look.',
    strongTitle: 'What stands out',
    strongIntro: 'The findings we grade strongest — each one quotes the record, page and line.',
    strong: [
      {
        partA:
          'Your loved one told his trial lawyer about a witness who could support his alibi — and the record shows the lawyer never contacted her. At trial, the State told the jury no one could back up his story. A lawyer will want to look at whether this counts as ineffective assistance of counsel.',
        cite: 'Reporter’s Record Vol. 4, p. 212: “Q: Did you ever attempt to contact Ms. Alvarez? A: I did not, no.”',
        partB:
          'Potential IAC (failure to investigate): trial counsel admitted on the record (RR4:212) that he made no attempt to contact the alibi witness the defendant identified pre-trial (RR2:88). Prejudice argument writes itself against the State’s closing (RR5:301: “not one person came here to say he was elsewhere”). Strickland analysis attaches.',
      },
      {
        partA:
          'A lab worker testified that her notes were kept in the State’s working file and never given to the defense. If those notes contained anything helpful to your loved one, the State may have had a duty to turn them over. A lawyer will want the rest of that file.',
        cite: 'Reporter’s Record Vol. 3, p. 145: “We kept those in our working file. They weren’t produced to anybody.”',
        partB:
          'Potential Brady issue: analyst conceded bench notes were never disclosed (RR3:145). Materiality unknown from this record alone — recommend a records request for the lab’s complete case file before evaluating a Brady claim.',
      },
    ],
    reviewTitle: 'Worth a closer look',
    review: [
      {
        partA:
          'The jury heard an expert compare a bite mark to your loved one. This type of comparison evidence has been seriously questioned by scientists since this trial. Texas has a specific law for challenging convictions built on science that has changed.',
        cite: 'Reporter’s Record Vol. 4, p. 233: “In my opinion the dentition is consistent with the defendant to a reasonable degree of certainty.”',
        partB:
          'Possible Art. 11.073 vector: bitemark comparison testimony (RR4:233) presented as individualizing. Post-2016 consensus (TFSC bitemark moratorium) undermines the field. Strength depends on how central the testimony was — it was referenced twice in closing (RR5:298, 305).',
      },
    ],
    deadlineTitle: 'Where the clock stands',
    deadlineBody:
      'A real report also shows the deadline picture for the case: when the conviction became final, our estimate of the federal one-year clock, and whether anything is pausing it right now — the dates a lawyer checks first.',
    nothingTitle: 'And when we find nothing?',
    nothingBody:
      'Some reviews end with no strong findings. That report says so plainly, shows what we checked, and spares your family thousands of dollars chasing weak claims. An honest "nothing strong here" is information too — we treat it with the same care.',
    ctaLead: 'This is what $299 buys — for your loved one’s real record.',
    cta: 'Start the free check',
  },
  es: {
    banner:
      'Esto es una MUESTRA construida con un caso ficticio ("State v. John Fixture") para que vea exactamente cómo es un informe real. Cada nombre, número y cita aquí abajo es inventado.',
    title: 'Informe de muestra — State v. John Fixture',
    intro:
      'Un informe real empieza con la conclusión, en palabras sencillas. Para este caso ficticio diría: encontramos dos cosas que un abogado querría ver pronto, y una más que vale una mirada más cercana.',
    strongTitle: 'Lo que destaca',
    strongIntro: 'Los hallazgos que calificamos más fuertes — cada uno cita el expediente, página y línea.',
    strong: [
      {
        partA:
          'Su ser querido le contó a su abogado sobre una testigo que podía apoyar su coartada — y el expediente muestra que el abogado nunca la contactó. En el juicio, el Estado le dijo al jurado que nadie podía respaldar su historia. Un abogado querrá analizar si esto cuenta como asistencia ineficaz.',
        cite: 'Reporter’s Record Vol. 4, p. 212: “Q: Did you ever attempt to contact Ms. Alvarez? A: I did not, no.”',
        partB:
          'Posible IAC (falta de investigación): el abogado admitió en el expediente (RR4:212) que no intentó contactar a la testigo de coartada que el acusado identificó antes del juicio (RR2:88). El argumento de perjuicio se escribe solo frente al cierre del Estado (RR5:301). Aplica el análisis de Strickland.',
      },
      {
        partA:
          'Una trabajadora del laboratorio testificó que sus notas se quedaron en el archivo del Estado y nunca se entregaron a la defensa. Si esas notas contenían algo útil para su ser querido, el Estado pudo haber tenido el deber de entregarlas. Un abogado querrá el resto de ese archivo.',
        cite: 'Reporter’s Record Vol. 3, p. 145: “We kept those in our working file. They weren’t produced to anybody.”',
        partB:
          'Posible cuestión Brady: la analista reconoció que las notas de laboratorio nunca se entregaron (RR3:145). La materialidad no se sabe solo con este expediente — se recomienda pedir el archivo completo del laboratorio antes de evaluar un reclamo Brady.',
      },
    ],
    reviewTitle: 'Vale una mirada más cercana',
    review: [
      {
        partA:
          'El jurado escuchó a un experto comparar una marca de mordida con su ser querido. Este tipo de evidencia ha sido seriamente cuestionada por los científicos desde este juicio. Texas tiene una ley específica para impugnar condenas construidas sobre ciencia que ha cambiado.',
        cite: 'Reporter’s Record Vol. 4, p. 233: “In my opinion the dentition is consistent with the defendant to a reasonable degree of certainty.”',
        partB:
          'Posible vía del Art. 11.073: testimonio de comparación de mordida (RR4:233) presentado como individualizador. El consenso posterior a 2016 (moratoria de la TFSC) debilita el campo. La fuerza depende de qué tan central fue el testimonio — se mencionó dos veces en el cierre (RR5:298, 305).',
      },
    ],
    deadlineTitle: 'Dónde está el reloj',
    deadlineBody:
      'Un informe real también muestra el panorama de plazos del caso: cuándo quedó firme la condena, nuestra estimación del reloj federal de un año, y si algo lo está pausando ahora — las fechas que un abogado revisa primero.',
    nothingTitle: '¿Y cuando no encontramos nada?',
    nothingBody:
      'Algunas revisiones terminan sin hallazgos fuertes. Ese informe lo dice claramente, muestra qué verificamos, y le ahorra a su familia miles de dólares persiguiendo reclamos débiles. Un honesto "no hay nada fuerte aquí" también es información — la tratamos con el mismo cuidado.',
    ctaLead: 'Esto es lo que compran los $299 — para el expediente real de su ser querido.',
    cta: 'Empiece la revisión gratis',
  },
}
