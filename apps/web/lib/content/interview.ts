/**
 * The person whose record this is (Case.subjectName, 2026-11-01): the
 * interview's first question, and the "Record of {name}" line the case pages
 * carry in their header once it is given. Free text, kept as the family typed
 * it, shown back to them and to staff — never read into any legal text. The
 * question is optional: an interview without it still completes.
 */
export const INTERVIEW_CONTENT = {
  en: {
    subjectName: {
      label: 'Whose record is this?',
      hint: 'Their name, as it appears on the judgment. You can leave this blank and add it later.',
      placeholder: 'For example, Juan Pérez',
    },
    /** `{name}` is the name as given. */
    recordOf: 'Record of {name}',
  },
  es: {
    subjectName: {
      label: '¿De quién es este expediente?',
      hint: 'Su nombre, tal como aparece en la sentencia. Puede dejarlo en blanco y agregarlo después.',
      placeholder: 'Por ejemplo, Juan Pérez',
    },
    recordOf: 'Expediente de {name}',
  },
}
