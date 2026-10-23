/**
 * The report page's "Time limits" section and the rule lines around it
 * (UPL review 2026-10-23, E5): the arithmetic stays, the verdicts go. The
 * page prints the dates it was given and what it counted from them, says
 * what the rule is, and leaves the rest to a lawyer. The PDF
 * (packages/reports/family-report.ts) carries the same English copy.
 * `{x}` placeholders are filled with `tpl`.
 */
export const REPORT_DEADLINE_CONTENT = {
  en: {
    title: 'Time limits (as of {asOf})',
    verify:
      'These dates are counted from the dates your family gave and the standard rules. They are not legal advice. A lawyer must check every date before anyone relies on it.',
    ended: 'By our count from the dates you gave, the one-year federal window ended on {date}.',
    endedNoDate: 'By our count from the dates you gave, the one-year federal window has ended.',
    open: 'By our count from the dates you gave, the one-year federal window is open until about {date}.',
    openNoDate: 'By our count from the dates you gave, the one-year federal window is open.',
    paused: 'By our count, the one-year federal window is paused while the state court decides.',
    basis: 'The count starts when the conviction became final ({finalityDate} — {finalityBasis}); about {daysElapsed} countable days have passed.',
    basisTolled: ' {daysTolled} of the days since then were paused during state filings.',
    pauseRule: 'A properly filed state application pauses this count only while it is pending; it does not restart it.',
    laches:
      'This conviction is old. Texas state habeas has no fixed deadline. Texas courts may consider delay (the rule is called laches); a lawyer can tell you whether it applies.',
    inShortNone:
      'In short: the checks this review runs did not find issues in this record on the questions they ask. What that does and does not mean is below.',
    inShortFound: 'In short: this review found issues in the record, listed below with the pages they come from.',
    subsequentWrit:
      'A writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4. A licensed Texas attorney is the person to take this to.',
    firstWrit: 'Texas law expects a first application to include every claim; this report is an inventory for a lawyer to complete.',
  },
  es: {
    title: 'Plazos (al {asOf})',
    verify:
      'Estas fechas se cuentan a partir de las fechas que su familia dio y de las reglas estándar. No son asesoría legal. Un abogado debe verificar cada fecha antes de que alguien se base en ella.',
    ended: 'Por nuestro conteo a partir de las fechas que usted dio, el plazo federal de un año terminó el {date}.',
    endedNoDate: 'Por nuestro conteo a partir de las fechas que usted dio, el plazo federal de un año ya terminó.',
    open: 'Por nuestro conteo a partir de las fechas que usted dio, el plazo federal de un año está abierto hasta alrededor del {date}.',
    openNoDate: 'Por nuestro conteo a partir de las fechas que usted dio, el plazo federal de un año está abierto.',
    paused: 'Por nuestro conteo, el plazo federal de un año está en pausa mientras el tribunal estatal decide.',
    basis: 'El conteo empieza cuando la condena se volvió final ({finalityDate} — {finalityBasis}); han pasado unos {daysElapsed} días contables.',
    basisTolled: ' {daysTolled} de los días desde entonces estuvieron en pausa durante trámites estatales.',
    pauseRule: 'Una solicitud estatal presentada correctamente pausa este conteo solo mientras está pendiente; no lo reinicia.',
    laches:
      'Esta condena es antigua. El hábeas corpus estatal de Texas no tiene un plazo fijo. Los tribunales de Texas pueden tomar en cuenta la demora (la regla se llama laches); un abogado puede decirle si aplica.',
    inShortNone:
      'En resumen: las revisiones que hacemos no encontraron asuntos en este expediente en las preguntas que hacen. Más abajo explicamos qué significa eso y qué no.',
    inShortFound: 'En resumen: esta revisión encontró asuntos en el expediente, listados abajo con las páginas de donde vienen.',
    subsequentWrit:
      'Ya se presentó un recurso (writ) sobre esta condena. La ley de Texas limita las solicitudes posteriores; la regla es el Artículo 11.07 §4. Un abogado con licencia en Texas es la persona a quien llevar esto.',
    firstWrit: 'La ley de Texas espera que una primera solicitud incluya todos los reclamos; este informe es un inventario para que un abogado lo complete.',
  },
}
