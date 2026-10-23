'use client'

import { NOT_A_LAW_FIRM, NOT_A_LAW_FIRM_SHORT } from '@hg/case-lifecycle'
import { useLang } from '../lib/i18n'

/**
 * The one statement (UPL review 2026-10-23, rec 1), rendered at body size in
 * the current language from the shared constant — never retyped on a page.
 * Outside a LangProvider the hook's default is English. `short` is the
 * footer form; the full form is what every page body carries.
 */
export default function NotASubstitute({ className = '', short = false }: { className?: string; short?: boolean }) {
  const { lang } = useLang()
  return (
    <p data-testid={short ? 'not-a-substitute-short' : 'not-a-substitute'} lang={lang} className={`text-base ${className}`.trim()}>
      {short ? NOT_A_LAW_FIRM_SHORT[lang] : NOT_A_LAW_FIRM[lang]}
    </p>
  )
}
