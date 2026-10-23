/**
 * Helpers for the signed-in professional flow (F2, counsel.spec.ts). They run
 * only against a LOCAL api (http://localhost:3001 by default) with a database
 * the Playwright process can reach through DATABASE_URL — CI provides
 * Postgres and Redis and starts the api before the suite. Against staging
 * (PLAYWRIGHT_BASE_URL set) the spec that uses them is skipped.
 *
 *  - seedAdmin():            an ADMIN account on its own tenant and a session
 *                            cookie for it (encoded the way next-auth does,
 *                            with the same NEXTAUTH_SECRET the api verifies).
 *  - setGlobalFlag():        PUT /ops/flags/:key           as that admin.
 *  - setTenantOverride():    PUT /ops/flags/:key/overrides/:tenantId
 *  - signupProfessional():   POST /counsel/signup, then the new tenant id;
 *                            the bar number is marked verified in the
 *                            database (the lawyer gate, UPL review
 *                            2026-10-23: matters open only once staff
 *                            verify it — the queue is a human act, so the
 *                            helper stands in for the staff member).
 *  - signInThroughPage():    the /auth/signin form, landing on /go.
 */
import type { APIRequestContext, Page } from '@playwright/test'

// The workspace packages are TypeScript sources resolved through pnpm's
// symlinks. Playwright's require hook transpiles them; a dynamic `import()`
// would hand the .ts file to Node's ESM loader instead and fail, so the
// loads below go through `require`.
/* eslint-disable @typescript-eslint/no-var-requires */
const db = () => require('@hg/database') as typeof import('@hg/database')
const auth = () => require('@hg/auth') as typeof import('@hg/auth')

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
export const PASSWORD = 'CorrectHorse9Battery!'
export const run = `e2e_${Date.now()}`

type FlagKey = 'counsel_surfaces' | 'counsel_checkout' | 'offices' | 'record_desk' | 'clinic_inbox' | 'long_records'

export interface Admin {
  userId: string
  tenantId: string
  cookie: string
}

export async function seedAdmin(): Promise<Admin> {
  const { default: prisma } = db()
  const { encodeSessionToken } = auth()
  const tenant = await prisma.tenant.create({ data: { name: `${run} staff` } })
  const admin = await prisma.user.create({ data: { email: `${run}_admin@example.com`, name: 'E2E Admin', tenantId: tenant.id, role: 'ADMIN', accountKind: 'STAFF' } })
  const token = await encodeSessionToken({ userId: admin.id, tenantId: tenant.id, role: 'ADMIN' })
  return { userId: admin.id, tenantId: tenant.id, cookie: `next-auth.session-token=${token}` }
}

export async function removeAdmin(admin: Admin) {
  const { default: prisma } = db()
  await prisma.user.deleteMany({ where: { tenantId: admin.tenantId } })
  await prisma.tenant.deleteMany({ where: { id: admin.tenantId } })
}

export async function setGlobalFlag(request: APIRequestContext, admin: Admin, key: FlagKey, enabled: boolean) {
  const res = await request.put(`${API_URL}/ops/flags/${key}`, { headers: { cookie: admin.cookie }, data: { enabled } })
  if (!res.ok()) throw new Error(`PUT /ops/flags/${key} → ${res.status()} ${await res.text()}`)
}

export async function setTenantOverride(request: APIRequestContext, admin: Admin, key: FlagKey, tenantId: string, enabled: boolean) {
  const res = await request.put(`${API_URL}/ops/flags/${key}/overrides/${tenantId}`, { headers: { cookie: admin.cookie }, data: { enabled, note: 'e2e' } })
  if (!res.ok()) throw new Error(`PUT /ops/flags/${key}/overrides → ${res.status()} ${await res.text()}`)
}

export async function clearTenantOverride(request: APIRequestContext, admin: Admin, key: FlagKey, tenantId: string) {
  await request.delete(`${API_URL}/ops/flags/${key}/overrides/${tenantId}`, { headers: { cookie: admin.cookie } })
}

export interface Professional {
  email: string
  userId: string
  organisationId: string
  tenantId: string
}

export async function signupProfessional(
  request: APIRequestContext,
  opts: { email?: string; name?: string; practiceType?: string; organisationName?: string; organisationKind?: 'FIRM' | 'PD_OFFICE' | 'CLINIC' } = {}
): Promise<Professional> {
  const email = opts.email ?? `${run}_${Math.random().toString(36).slice(2, 8)}@example.com`
  const res = await request.post(`${API_URL}/counsel/signup`, {
    data: {
      email,
      password: PASSWORD,
      name: opts.name ?? 'Maria Lopez',
      barNumber: '24099999',
      practiceType: opts.practiceType ?? 'appellate',
      organisationName: opts.organisationName ?? `${run} Lopez Appellate`,
      organisationKind: opts.organisationKind ?? 'FIRM',
    },
  })
  if (!res.ok()) throw new Error(`POST /counsel/signup → ${res.status()} ${await res.text()}`)
  const body = (await res.json()) as { userId?: string; organisationId?: string }
  if (!body.userId || !body.organisationId) throw new Error('sign-up answered without ids (duplicate email?)')
  const { default: prisma } = db()
  const user = await prisma.user.update({
    where: { id: body.userId },
    data: { barVerifiedAt: new Date(), barVerificationStatus: 'VERIFIED' },
    select: { tenantId: true },
  })
  return { email, userId: body.userId, organisationId: body.organisationId, tenantId: user.tenantId }
}

/** The professional a sign-up through the page created, by email. */
export async function findProfessional(email: string): Promise<Professional> {
  const { default: prisma } = db()
  const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { id: true, tenantId: true } })
  const org = await prisma.organisation.findFirstOrThrow({ where: { tenantId: user.tenantId }, select: { id: true } })
  return { email, userId: user.id, organisationId: org.id, tenantId: user.tenantId }
}

export async function removeProfessional(p: Professional) {
  const { default: prisma } = db()
  await prisma.caseAccess.deleteMany({ where: { case: { tenantId: p.tenantId } } })
  await prisma.matter.deleteMany({ where: { tenantId: p.tenantId } })
  await prisma.case.deleteMany({ where: { tenantId: p.tenantId } })
  await prisma.membership.deleteMany({ where: { tenantId: p.tenantId } })
  await prisma.organisation.deleteMany({ where: { tenantId: p.tenantId } })
  await prisma.user.deleteMany({ where: { tenantId: p.tenantId } })
  await prisma.tenant.deleteMany({ where: { id: p.tenantId } })
}

/** The sign-in page, then /go (the role-aware landing) — a professional lands on /counsel. */
export async function signInThroughPage(page: Page, email: string, password = PASSWORD) {
  await page.goto('/auth/signin')
  await page.getByLabel('Email address').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /^Sign in$/ }).click()
  await page.waitForURL(/\/counsel/, { timeout: 20_000 })
}
