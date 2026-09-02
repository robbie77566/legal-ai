/**
 * Learn hub + first four articles (snotnoselegal_site_design.md §3 P2).
 * Every article is INFORMATION ABOUT THE LAW, never advice about a case:
 * plain words, ~8th grade, both languages, each ending with the same
 * disclaimer. New/changed articles join the counsel review queue (runbook).
 */
export const LEARN_CONTENT = {
  en: {
    title: 'Learn',
    intro:
      'Plain-words explanations of the things families run into after a Texas conviction. Free, no sign-up. This is information about how the law works — not advice about your case; a licensed attorney is the right person for that.',
    disclaimer:
      'This page explains the law in general terms. It is not legal advice, and your loved one’s case may be different. A licensed attorney is the right person to apply any of this to a real case.',
    guideCard: {
      title: 'How to get the court documents',
      blurb: 'Who to call, what to say, and what each paper looks like.',
    },
    articles: {
      'what-is-an-11-07-writ': {
        title: 'What is an 11.07 writ, in plain words',
        blurb: 'The main way a final Texas conviction gets challenged — and why it’s different from an appeal.',
        sections: [
          [
            'The short version',
            'A writ of habeas corpus under Article 11.07 is a formal request asking Texas’s highest criminal court to look at a conviction again after the normal appeal is over. It is not a second appeal — it is a different tool, used to raise problems that could not be raised, or were not raised, on appeal.',
          ],
          [
            'What kinds of problems it can raise',
            'The most common claims are about things outside the trial record as it stood: a defense lawyer who did their job so poorly it changed the outcome, evidence the State had but never turned over, science used at trial that has since been discredited, or a sentence the law did not actually allow.',
          ],
          [
            'Who decides',
            'The application is filed in the county of conviction, the trial court gathers responses and sometimes holds a hearing, and the Texas Court of Criminal Appeals in Austin makes the final decision.',
          ],
          [
            'Why the record matters so much',
            'A writ lives or dies on what can be shown, page and line. Vague unfairness is not enough — courts want specific facts, tied to specific parts of the record or to new evidence. That is why reading the complete record carefully is where every serious effort starts.',
          ],
        ],
      },
      'the-federal-one-year-deadline': {
        title: 'The federal one-year deadline (AEDPA), explained',
        blurb: 'A clock most families have never heard of — and the most common way federal review is lost.',
        sections: [
          [
            'The short version',
            'A federal law called AEDPA gives most state prisoners one year to ask a federal court to review their conviction. The clock usually starts when the conviction becomes final — often when the time to appeal runs out — and missing it usually closes the federal courthouse door for good.',
          ],
          [
            'Why people miss it',
            'The clock is famously easy to miscalculate. It can pause while a properly filed state writ is pending, but it does not pause while a case merely feels unresolved, and time spent deciding, saving money, or waiting for a lawyer to call back all counts against the year.',
          ],
          [
            'What this means practically',
            'Anyone thinking about post-conviction options is also, whether they know it or not, managing this clock. Knowing the key dates in the record — when the judgment was entered, when the appeal ended — is the raw material for calculating it, and it is a calculation worth having a lawyer confirm.',
          ],
        ],
      },
      'why-the-first-writ-matters-most': {
        title: 'Why the first writ matters so much',
        blurb: 'Texas law makes the first application effectively the only full chance — here’s the rule behind that.',
        sections: [
          [
            'The short version',
            'Texas law sharply limits second writs. After the first 11.07 application is decided, a later one is only heard in narrow situations — mainly new facts that genuinely could not have been found earlier, or a few special legal changes. Courts apply this bar strictly.',
          ],
          [
            'What that means for a weak first filing',
            'A first application that throws in half-formed claims does not keep options open — it usually spends them. Claims that could have been raised the first time are generally barred from a second application, even good ones.',
          ],
          [
            'The practical takeaway',
            'The one real chance deserves the strongest possible preparation: the full record read, every potential claim identified and weighed, and a deliberate decision about what to raise. That preparation is exactly the information gap our review exists to close — and it is why "just file something" is the most dangerous advice a family can get.',
          ],
        ],
      },
      'what-ineffective-assistance-means': {
        title: 'What “ineffective assistance of counsel” actually means',
        blurb: 'It’s the most common claim in Texas writs — and it means something narrower than “my lawyer was bad.”',
        sections: [
          [
            'The short version',
            'The Constitution guarantees not just a lawyer, but a minimally effective one. An ineffective-assistance claim (lawyers say “IAC”) argues the defense lawyer’s performance fell below professional standards AND that it likely changed the outcome. Both parts are required.',
          ],
          [
            'What tends to count',
            'Examples courts have taken seriously: failing to investigate an alibi or an obvious witness, not consulting an expert where the case turned on science, giving wrong advice that led to a plea, failing to object to clearly inadmissible evidence, or missing a filing that forfeited an appeal.',
          ],
          [
            'What tends not to count',
            'Strategy calls that simply didn’t work, a gruff manner, or losing a hard case are generally not enough. The question is professional competence and effect on the result — not likability, and not the verdict alone.',
          ],
          [
            'Where the record comes in',
            'IAC claims are usually built from the record: what the lawyer did and didn’t do at each moment, what objections were or weren’t made, what the evidence actually showed. That is why a careful read of the transcripts matters more for this claim than for almost any other.',
          ],
        ],
      },
    },
  },
  es: {
    title: 'Aprenda',
    intro:
      'Explicaciones en palabras sencillas de las cosas que las familias enfrentan después de una condena en Texas. Gratis, sin registrarse. Esto es información sobre cómo funciona la ley — no es consejo sobre su caso; un abogado con licencia es la persona indicada para eso.',
    disclaimer:
      'Esta página explica la ley en términos generales. No es consejo legal, y el caso de su ser querido puede ser diferente. Un abogado con licencia es la persona indicada para aplicar esto a un caso real.',
    guideCard: {
      title: 'Cómo conseguir los documentos del tribunal',
      blurb: 'A quién llamar, qué decir y cómo se ve cada documento.',
    },
    articles: {
      'what-is-an-11-07-writ': {
        title: 'Qué es un recurso 11.07, en palabras sencillas',
        blurb: 'La vía principal para impugnar una condena firme en Texas — y por qué es distinta de una apelación.',
        sections: [
          [
            'La versión corta',
            'Un recurso de hábeas corpus bajo el Artículo 11.07 es una petición formal que pide al tribunal penal más alto de Texas revisar una condena después de que la apelación normal terminó. No es una segunda apelación — es una herramienta diferente, para plantear problemas que no se pudieron plantear, o no se plantearon, en la apelación.',
          ],
          [
            'Qué tipos de problemas puede plantear',
            'Los reclamos más comunes tratan de cosas fuera del expediente del juicio tal como estaba: un abogado defensor que hizo su trabajo tan mal que cambió el resultado, evidencia que el Estado tenía y nunca entregó, ciencia usada en el juicio que después fue desacreditada, o una sentencia que la ley en realidad no permitía.',
          ],
          [
            'Quién decide',
            'La solicitud se presenta en el condado de la condena, el tribunal de primera instancia reúne respuestas y a veces celebra una audiencia, y la Corte de Apelaciones Penales de Texas en Austin toma la decisión final.',
          ],
          [
            'Por qué el expediente importa tanto',
            'Un recurso vive o muere según lo que se pueda demostrar, página y línea. La injusticia vaga no basta — los tribunales quieren hechos específicos, ligados a partes específicas del expediente o a evidencia nueva. Por eso, leer el expediente completo con cuidado es donde empieza todo esfuerzo serio.',
          ],
        ],
      },
      'the-federal-one-year-deadline': {
        title: 'El plazo federal de un año (AEDPA), explicado',
        blurb: 'Un reloj del que la mayoría de las familias nunca ha oído — y la forma más común de perder la revisión federal.',
        sections: [
          [
            'La versión corta',
            'Una ley federal llamada AEDPA da a la mayoría de los presos estatales un año para pedir que un tribunal federal revise su condena. El reloj normalmente empieza cuando la condena queda firme — a menudo cuando se vence el plazo para apelar — y perderlo normalmente cierra la puerta del tribunal federal para siempre.',
          ],
          [
            'Por qué la gente lo pierde',
            'El reloj es famosamente fácil de calcular mal. Puede pausarse mientras un recurso estatal debidamente presentado está pendiente, pero no se pausa mientras un caso simplemente se siente sin resolver, y el tiempo que se pasa decidiendo, ahorrando dinero o esperando la llamada de un abogado cuenta contra el año.',
          ],
          [
            'Qué significa en la práctica',
            'Cualquiera que esté considerando opciones post-condena también está, lo sepa o no, administrando este reloj. Conocer las fechas clave del expediente — cuándo se dictó la sentencia, cuándo terminó la apelación — es la materia prima para calcularlo, y es un cálculo que vale la pena que un abogado confirme.',
          ],
        ],
      },
      'why-the-first-writ-matters-most': {
        title: 'Por qué el primer recurso importa tanto',
        blurb: 'La ley de Texas hace que la primera solicitud sea, en la práctica, la única oportunidad completa — esta es la regla detrás de eso.',
        sections: [
          [
            'La versión corta',
            'La ley de Texas limita fuertemente los segundos recursos. Después de que se decide la primera solicitud 11.07, una posterior solo se escucha en situaciones estrechas — principalmente hechos nuevos que genuinamente no se podían encontrar antes, o unos pocos cambios legales especiales. Los tribunales aplican esta barrera estrictamente.',
          ],
          [
            'Qué significa eso para una primera solicitud débil',
            'Una primera solicitud llena de reclamos a medio formar no mantiene las opciones abiertas — normalmente las gasta. Los reclamos que se pudieron plantear la primera vez generalmente quedan bloqueados en una segunda solicitud, incluso los buenos.',
          ],
          [
            'La conclusión práctica',
            'La única oportunidad real merece la preparación más fuerte posible: el expediente completo leído, cada reclamo potencial identificado y sopesado, y una decisión deliberada sobre qué plantear. Esa preparación es exactamente la falta de información que nuestra revisión existe para cerrar — y es por lo que "presente cualquier cosa" es el consejo más peligroso que una familia puede recibir.',
          ],
        ],
      },
      'what-ineffective-assistance-means': {
        title: 'Qué significa realmente “asistencia ineficaz del abogado”',
        blurb: 'Es el reclamo más común en los recursos de Texas — y significa algo más estrecho que “mi abogado era malo”.',
        sections: [
          [
            'La versión corta',
            'La Constitución garantiza no solo un abogado, sino uno mínimamente eficaz. Un reclamo de asistencia ineficaz (los abogados dicen "IAC") argumenta que el desempeño del defensor cayó por debajo de los estándares profesionales Y que probablemente cambió el resultado. Ambas partes son necesarias.',
          ],
          [
            'Qué suele contar',
            'Ejemplos que los tribunales han tomado en serio: no investigar una coartada o un testigo obvio, no consultar a un experto cuando el caso dependía de la ciencia, dar un consejo equivocado que llevó a una declaración de culpabilidad, no objetar evidencia claramente inadmisible, o perder una presentación que costó la apelación.',
          ],
          [
            'Qué no suele contar',
            'Decisiones de estrategia que simplemente no funcionaron, un trato brusco, o perder un caso difícil generalmente no bastan. La pregunta es la competencia profesional y el efecto en el resultado — no la simpatía, y no el veredicto por sí solo.',
          ],
          [
            'Dónde entra el expediente',
            'Los reclamos de IAC normalmente se construyen desde el expediente: qué hizo y qué no hizo el abogado en cada momento, qué objeciones se hicieron o no, qué mostró realmente la evidencia. Por eso una lectura cuidadosa de las transcripciones importa más para este reclamo que para casi cualquier otro.',
          ],
        ],
      },
    },
  },
}
