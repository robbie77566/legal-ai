/**
 * Civil-date normalization (2026-09-12): a family's judgment date arrived as
 * something other than YYYY-MM-DD and the API answered with the regex's own
 * message ("YYYY-MM-DD"), which reached Sentry as a new issue. Accept the
 * shapes people actually type; return the input unchanged when it cannot be
 * read so the schema still refuses it — with a human message.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const US = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/ // M/D/YYYY, MM-DD-YYYY
const YMD_SLASH = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2100

/** '' / null → undefined; recognizable dates → 'YYYY-MM-DD'; anything else → unchanged. */
export function normalizeCivilDate(v: unknown): string | undefined | unknown {
  if (v == null) return undefined
  if (typeof v !== 'string') return v
  const s = v.trim()
  if (s === '') return undefined
  let m: RegExpMatchArray | null
  if ((m = s.match(ISO))) return s
  if ((m = s.match(US))) { const [, a, b, y] = m; const mo = Number(a), d = Number(b); return valid(Number(y), mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : s }
  if ((m = s.match(YMD_SLASH))) { const [, y, a, b] = m; const mo = Number(a), d = Number(b); return valid(Number(y), mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : s }
  // "September 12, 2019", "Sep 12 2019", "12 September 2019"
  const words = s.toLowerCase().replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 3) {
    const monthIdx = (w: string) => MONTHS.findIndex((mm) => mm === w || mm.slice(0, 3) === w.slice(0, 3))
    const asNum = (w: string) => (/^\d+$/.test(w) ? Number(w) : NaN)
    const tryOrder = (mw: string, dw: string, yw: string) => {
      const mo = monthIdx(mw) + 1, d = asNum(dw), y = asNum(yw)
      return mo >= 1 && Number.isFinite(d) && Number.isFinite(y) && valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
    }
    return tryOrder(words[0], words[1], words[2]) ?? tryOrder(words[1], words[0], words[2]) ?? s
  }
  return s
}

export const CIVIL_DATE_MESSAGE = 'Enter the date as YYYY-MM-DD (for example 2019-09-12) — it is on the judgment paper.'
