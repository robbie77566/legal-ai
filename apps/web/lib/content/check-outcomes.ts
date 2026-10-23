/**
 * The free check's outcome screens (UI spec §5.2; UPL review 2026-10-23,
 * E6 and F4). Every outcome says only whether this review is built for the
 * case as described, and what the record or the rule says — never whether
 * a filing would succeed, be dismissed or be unavailable, and never what a
 * lawyer or a court would do. The same next step closes every screen.
 * Exported as one object so the describe-not-conclude test can read every
 * string; the parity test enforces the Spanish twin.
 */
export const CHECK_OUTCOME_COPY = {
  en: {
    capital: {
      title: 'This review is not built for a death-penalty case.',
      body: 'Capital cases have a right to appointed post-conviction counsel under Texas law, with their own strict deadlines. This review does not cover them.',
      next: 'The Office of Capital and Forensic Writs and the appointed attorney are the people to take this to.',
    },
    pending: {
      title: 'The conviction isn’t final yet.',
      body: 'This review is built for convictions that are final. While a direct appeal is still open, the record is still changing, so we ask you to come back after the appeal is decided.',
    },
    notFit: {
      title: 'This review isn’t the right fit — here’s what is.',
      misdemeanor: 'This review is built for felony convictions; misdemeanor cases are handled under a different rule.',
      discharged: 'This review is built for people still serving a sentence. If the sentence is finished, a lawyer can tell you what options exist.',
      other: 'This review covers Texas state convictions only.',
      resources: 'These groups can point you in the right direction:',
    },
    fit: {
      title: 'This looks like a fit.',
      priorWritLead: 'Read this first:',
      priorWrit: 'a writ was already filed on this conviction. Texas law limits later applications; the rule is Article 11.07 §4. The report will show what the record says, and a licensed Texas attorney is the person to take it to.',
      plea: 'A plea case has a thinner record than a trial, so the review focuses on the plea papers. The report says what a plea record does and does not show.',
      appealRestoration: 'You said the lawyer never filed the appeal you asked for. The review looks for that specifically and the report will show what the record says about it.',
      newEvidence: 'The evidence you mentioned that was never presented will be flagged in your report for a lawyer. A record review cannot evaluate it, so the report marks it for the lawyer to see.',
      next: 'Here’s what happens next: review the details, create an account, and send the documents at your own pace.',
      cta: 'Continue — $299, one price',
    },
    resources: {
      tifa: 'TIFA — Texas Inmate Families Association (peer support)',
      lris: 'State Bar of Texas Lawyer Referral & Information Service',
    },
    /** Resume banner (G-E2): "a fit" / "not a fit" only. */
    words: {
      fit_trial: 'a fit — a trial conviction',
      fit_plea: 'a fit — a plea conviction',
      prior_writ_warned: 'a fit — a writ was filed before',
      capital: 'not a fit (death-penalty case)',
      pending_appeal: 'not a fit yet (the appeal is still open)',
      misdemeanor: 'not a fit (misdemeanor)',
      discharged: 'not a fit (sentence finished)',
      not_fit_other: 'not a fit',
    },
  },
  es: {
    capital: {
      title: 'Esta revisión no está hecha para un caso de pena de muerte.',
      body: 'Los casos de pena capital tienen derecho a un abogado nombrado para la etapa posterior a la condena bajo la ley de Texas, con sus propios plazos estrictos. Esta revisión no los cubre.',
      next: 'La Oficina de Recursos Capitales y Forenses (Office of Capital and Forensic Writs) y el abogado nombrado son las personas a quienes llevar esto.',
    },
    pending: {
      title: 'La condena todavía no es final.',
      body: 'Esta revisión está hecha para condenas que ya son finales. Mientras la apelación directa siga abierta, el expediente sigue cambiando, así que le pedimos volver después de que se decida la apelación.',
    },
    notFit: {
      title: 'Esta revisión no es la adecuada — esto es lo que sí.',
      misdemeanor: 'Esta revisión está hecha para condenas por delito grave (felony); los casos de delito menor se manejan bajo una regla distinta.',
      discharged: 'Esta revisión está hecha para personas que todavía cumplen una sentencia. Si la sentencia ya terminó, un abogado puede decirle qué opciones existen.',
      other: 'Esta revisión cubre solo condenas de tribunales estatales de Texas.',
      resources: 'Estos grupos pueden orientarle:',
    },
    fit: {
      title: 'Esto parece encajar.',
      priorWritLead: 'Lea esto primero:',
      priorWrit: 'ya se presentó un recurso (writ) sobre esta condena. La ley de Texas limita las solicitudes posteriores; la regla es el Artículo 11.07 §4. El informe mostrará lo que dice el expediente, y un abogado con licencia en Texas es la persona a quien llevarlo.',
      plea: 'Un caso con declaración de culpabilidad tiene un expediente más corto que un juicio, así que la revisión se enfoca en los papeles de la declaración. El informe dice qué muestra y qué no muestra ese expediente.',
      appealRestoration: 'Usted dijo que el abogado nunca presentó la apelación que pidió. La revisión busca eso en particular y el informe mostrará lo que dice el expediente al respecto.',
      newEvidence: 'La evidencia que mencionó y que nunca se presentó quedará marcada en su informe para un abogado. Una revisión del expediente no puede evaluarla, así que el informe la señala para que el abogado la vea.',
      next: 'Esto es lo que sigue: revise los detalles, cree una cuenta y envíe los documentos a su propio ritmo.',
      cta: 'Continuar — $299, un solo precio',
    },
    resources: {
      tifa: 'TIFA — Texas Inmate Families Association (apoyo entre familias)',
      lris: 'Servicio de Referencia e Información de Abogados del Colegio de Abogados de Texas',
    },
    words: {
      fit_trial: 'encaja — una condena por juicio',
      fit_plea: 'encaja — una condena por declaración de culpabilidad',
      prior_writ_warned: 'encaja — ya se presentó un recurso antes',
      capital: 'no encaja (caso de pena de muerte)',
      pending_appeal: 'todavía no encaja (la apelación sigue abierta)',
      misdemeanor: 'no encaja (delito menor)',
      discharged: 'no encaja (sentencia terminada)',
      not_fit_other: 'no encaja',
    },
  },
}
