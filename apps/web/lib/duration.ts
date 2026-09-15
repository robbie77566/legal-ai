/** "42s", "3m 05s", "1h 12m" — for the Accounts page's time on site. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (m < 60) return r ? `${m}m ${String(r).padStart(2, '0')}s` : `${m}m`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? `${h}h ${String(mm).padStart(2, '0')}m` : `${h}h`
}

/** Date and time an admin can act on; "never" when it has not happened. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
