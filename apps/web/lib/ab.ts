/**
 * Palette A/B experiment (color_research_landing.md §5-6).
 *
 * Assignment: 50/50 at first visit, persisted in localStorage so the
 * palette never flips mid-funnel. Storage can throw (private mode,
 * blocked site data) — every access is guarded and the default is the
 * incumbent 'amber'.
 *
 * Capture: PostHog /capture with the public project key; silent no-op
 * without NEXT_PUBLIC_POSTHOG_KEY. distinct_id is the anonymous variant
 * seed — no PII, ever (NFR-3).
 */

export type PaletteVariant = 'amber' | 'harbor'

const KEY = 'snl_palette'
const SEED_KEY = 'snl_anon_id'

export function getPaletteVariant(): PaletteVariant {
  try {
    // Explicit preview/demo override: ?palette=amber|harbor wins and
    // persists (so a support link or device test shows one scheme
    // consistently through the whole funnel).
    const forced = new URLSearchParams(window.location.search).get('palette')
    if (forced === 'amber' || forced === 'harbor') {
      window.localStorage.setItem(KEY, forced)
      return forced
    }
    const existing = window.localStorage.getItem(KEY)
    if (existing === 'amber' || existing === 'harbor') return existing
    const assigned: PaletteVariant = Math.random() < 0.5 ? 'amber' : 'harbor'
    window.localStorage.setItem(KEY, assigned)
    return assigned
  } catch {
    return 'amber'
  }
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
