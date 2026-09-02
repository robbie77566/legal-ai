/**
 * Funnel analytics (color_research_landing.md §5-6). The palette A/B that
 * lived here is retired — see getPaletteVariant.
 *
 * Capture: PostHog /capture with the public project key; silent no-op
 * without NEXT_PUBLIC_POSTHOG_KEY. distinct_id is the anonymous variant
 * seed — no PII, ever (NFR-3).
 */

export type PaletteVariant = 'amber' | 'harbor'

const SEED_KEY = 'snl_anon_id'

/**
 * The palette experiment is RETIRED (PO decision 2026-09-02): harbor is the
 * theme. Kept as a function so analytics properties and the PDF theming
 * call sites stay stable — it simply always answers 'harbor'.
 */
export function getPaletteVariant(): PaletteVariant {
  return 'harbor'
}

function anonId(): string {
  try {
    let id = window.localStorage.getItem(SEED_KEY)
    if (!id) {
      id = `anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
      window.localStorage.setItem(SEED_KEY, id)
    }
    return id
  } catch {
    return 'anon_unknown'
  }
}

export function captureAb(event: string, properties: Record<string, string | number | boolean> = {}): void {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  try {
    void fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: anonId(),
        properties: { ...properties, source: 'web' },
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* analytics never breaks the page */
  }
}
