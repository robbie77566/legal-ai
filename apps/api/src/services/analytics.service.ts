/**
 * snl.* product analytics (M6, analytics plan §5) — server-side capture to
 * PostHog when POSTHOG_API_KEY is set; silent no-op otherwise.
 *
 * PII-minimal by construction: distinct_id is the tenantId (pseudonymous),
 * properties are counts/stages only — never names, emails, or case content
 * (NFR-3). Fire-and-forget: analytics can never fail product work.
 */

export function capture(event: string, tenantId: string, properties: Record<string, string | number | boolean> = {}): void {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return;
  const host = process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';
  void fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: tenantId,
      properties: { ...properties, source: 'api' },
      timestamp: new Date().toISOString(),
    }),
  }).catch((e) => console.warn(`[analytics] capture failed: ${(e as Error).message}`));
}
