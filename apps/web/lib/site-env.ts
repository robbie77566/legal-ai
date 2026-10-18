/**
 * Which deployment is this web process? Staging answers the same code from
 * https://staging.snotnoselegal.com (render.staging.yaml) and must never be
 * indexed: a crawler that finds it would list test pages next to the real
 * site. NEXTAUTH_URL is the one variable every deployment already sets to its
 * own public origin, so no new env var is needed and env-drift parity holds.
 */
export function isStagingSite(origin: string | undefined = process.env.NEXTAUTH_URL): boolean {
  if (!origin) return false
  try {
    return new URL(origin).hostname.startsWith('staging.')
  } catch {
    return false
  }
}
