'use client'

/**
 * Daybreak password field: show/hide toggle + a live checklist of the
 * three rules (≥12 chars, an uppercase letter, a number or symbol) that
 * turn green as they are met. Built because a tester "thought I provided
 * what it needed but can't tell after getting an error" (2026-09-02):
 * the rule the server enforces must be visible BEFORE submit, and the
 * typed value must be checkable by eye.
 */
import { useState } from 'react'
import { useContent } from '../../lib/i18n'

const T = {
  en: { show: 'Show', hide: 'Hide', rules: ['At least 12 characters', 'An uppercase letter', 'A number or symbol'] },
  es: { show: 'Mostrar', hide: 'Ocultar', rules: ['Al menos 12 caracteres', 'Una letra mayúscula', 'Un número o símbolo'] },
}

export const PASSWORD_RULES: ((v: string) => boolean)[] = [
  (v) => v.length >= 12,
  (v) => /[A-Z]/.test(v),
  (v) => /[0-9!@#$%^&*()_+\-=[\]{}|;':",.<>/?]/.test(v),
]

export default function PasswordField({
  label,
  value,
  onChange,
  autoComplete = 'new-password',
  showRules = true,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  showRules?: boolean
}) {
  const t = useContent(T)
  const [visible, setVisible] = useState(false)
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative mt-1 block">
        <input
          type={visible ? 'text' : 'password'}
          required
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-db-line bg-db-surface p-3 pr-20"
          data-testid="password-input"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-sm font-semibold text-db-accent"
          data-testid="password-toggle"
        >
          {visible ? t.hide : t.show}
        </button>
      </span>
      {showRules && (
        <ul className="mt-2 space-y-0.5 text-sm" data-testid="password-rules">
          {t.rules.map((rule, i) => {
            const ok = PASSWORD_RULES[i](value)
            return (
              <li key={rule} className={ok ? 'text-db-signal' : 'text-db-muted'} data-ok={ok}>
                <span aria-hidden>{ok ? '✓' : '○'}</span> {rule}
              </li>
            )
          })}
        </ul>
      )}
    </label>
  )
}
