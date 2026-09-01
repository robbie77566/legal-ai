'use client'

/**
 * Lightweight i18n (i18n_localization.md §2): one locale pair, typed
 * bilingual content objects co-located with their surfaces, context-based
 * selection persisted in localStorage with a ?lang= override. Deliberately
 * NOT a routing framework — decision and trade-offs in the spec.
 */
import { createContext, useContext, useEffect, useState } from 'react'

export type Lang = 'en' | 'es'

const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: 'en',
  setLang: () => {},
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  useEffect(() => {
    try {
      const forced = new URLSearchParams(window.location.search).get('lang')
      if (forced === 'es' || forced === 'en') {
        window.localStorage.setItem('snl_lang', forced)
        setLangState(forced)
        return
      }
      const stored = window.localStorage.getItem('snl_lang')
      if (stored === 'es' || stored === 'en') setLangState(stored)
    } catch {
      /* default en */
    }
  }, [])

  const setLang = (l: Lang) => {
    try {
      window.localStorage.setItem('snl_lang', l)
    } catch {
      /* fine */
    }
    setLangState(l)
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

/** Pick the current language's content from a bilingual object. */
export function useContent<T>(content: { en: T; es: T }): T {
  const { lang } = useLang()
  return content[lang]
}

/** Text-labeled switcher (never flags — i18n_localization.md R2). */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang()
  return (
    <button
      data-testid="lang-switch"
      onClick={() => setLang(lang === 'en' ? 'es' : 'en')}
      className={`rounded-full border border-db-line px-3 py-1.5 text-sm font-semibold ${className}`}
      aria-label={lang === 'en' ? 'Cambiar a español' : 'Switch to English'}
    >
      {lang === 'en' ? 'Español' : 'English'}
    </button>
  )
}
