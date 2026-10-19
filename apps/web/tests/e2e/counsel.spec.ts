import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  clearTenantOverride,
  findProfessional,
  removeAdmin,
  removeProfessional,
  seedAdmin,
  setGlobalFlag,
  setTenantOverride,
  signInThroughPage,
  signupProfessional,
  type Admin,
  type Professional,
} from './helpers/counsel'

/**
 * Workstream F (persona_rollout_plan.md §5 F) in a real browser.
 *
 *  F1  The public professional pages render their sections in order on the
 *      adopted ladder, the family home never links to /counsel, /for-counsel
 *      never links to /review or /check, and axe finds nothing serious or
 *      critical. Runs everywhere (CI and the post-deploy staging run).
 *
 *  F2  The signed-in flow against a LOCAL api with the flag flipped for the
 *      test tenant by a seeded ADMIN: sign in → /counsel empty state → new
 *      matter (direct_appeal) → the matter page shows the TRAP clock and the
 *      uploader → /counsel/org shows the owner; plus the dark-flag 404 and
 *      the sign-up page itself. Skipped on staging (PLAYWRIGHT_BASE_URL).
 */
const REMOTE = !!process.env.PLAYWRIGHT_BASE_URL

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join('; ')})`)).toEqual([])
}

test.describe('F1 — public professional pages', () => {
  test('/for-counsel: the nine sections in order, the adopted ladder, no family funnel link', async ({ page }) => {
    await page.goto('/for-counsel')
    await expect(page.locator('h1')).toContainText('Every preserved objection')
    const ids = await page.locator('main > section').evaluateAll((els) => els.map((e) => e.id))
    expect(ids).toEqual(['hero', 'packet', 'fit', 'not', 'pricing', 'trust', 'pilot', 'signup', 'faq'])
    const headings = await page.locator('main h2').allTextContents()
    expect(headings).toEqual(['The packet', 'How it fits the work', 'What it is not', 'Pricing', 'Trust', 'Public defender pilot', 'Sign up', 'Questions counsel ask'])

    const ladder = page.getByTestId('ladder')
    await expect(ladder).toContainText('$149')
    await expect(ladder).toContainText('$249')
    await expect(ladder).toContainText('$349')
    await expect(page.locator('main')).not.toContainText('$199')
    await expect(page.locator('main')).toContainText('from $499')

    const sample = page.getByTestId('sample-part-b')
    await expect(sample).toContainText('RR vol. 4 · p. 212 · l. 14–16')
    await expect(sample).toContainText('I did not, no.')

    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    expect(hrefs.filter((h) => h === '/review' || h === '/check' || h.startsWith('/check?'))).toEqual([])
    expect(hrefs).toContain('/for-counsel/signup')
    // The sign-up block says one of two things, never nothing.
    await expect(page.getByTestId('signups-closed').or(page.getByTestId('signups-open'))).toBeVisible()
    await expectAxeClean(page)
  })

  test('/for-offices: pilot, plans by quote, free seats, ACH, the security page', async ({ page }) => {
    await page.goto('/for-offices')
    const headings = await page.locator('main h2').allTextContents()
    expect(headings).toEqual(['The pilot', 'Office plans', 'Security', 'Start a pilot'])
    await expect(page.getByTestId('pilot-offer')).toContainText('15 records · 90 days · free')
    const plans = page.getByTestId('office-plans')
    for (const p of ['Office 50', 'Office 120', 'Office 250']) await expect(plans).toContainText(p)
    await expect(page.locator('main')).toContainText('Investigator and viewer seats are free')
    await expect(page.locator('main')).toContainText('ACH')
    await expect(page.locator('main')).not.toContainText('$199')
    await expectAxeClean(page)

    await page.getByTestId('security-link').click()
    await expect(page).toHaveURL(/\/for-offices\/security$/)
    await expect(page.locator('h1')).toContainText('Security one-pager')
    await expect(page.locator('main')).toContainText('row-level-security')
    await expectAxeClean(page)
  })

  test('/for-investigators: free membership, the chronology as a service, prices on request', async ({ page }) => {
    await page.goto('/for-investigators')
    const headings = await page.locator('main h2').allTextContents()
    expect(headings).toEqual(['Free membership', 'The chronology as a Record Desk service', 'The request form', 'Get a seat'])
    await expect(page.getByTestId('investigator-price')).toContainText('Prices on request')
    await expect(page.locator('main')).not.toContainText(/\$\d/)
    await expectAxeClean(page)
  })

  test('the family home never links to /counsel; its footer carries one "For counsel" text link', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    expect(hrefs.filter((h) => h.startsWith('/counsel'))).toEqual([])
    expect(hrefs.filter((h) => h === '/for-counsel')).toHaveLength(1)
    await expect(page.locator('nav').first()).not.toContainText('For counsel')
  })

  test('the professional nav never links to the family pages', async ({ page }) => {
    await page.goto('/for-counsel')
    const nav = page.getByTestId('professional-site-nav')
    const hrefs = await nav.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))
    for (const h of hrefs) expect(h).toMatch(/^\/(for-counsel|for-offices|for-investigators|auth\/signin)/)
  })
})

test.describe('F2 — the signed-in professional flow (local api)', () => {
  test.skip(REMOTE, 'needs the seeded admin and the flag override on a local api')
  test.describe.configure({ mode: 'serial' })

  let admin: Admin
  let pro: Professional

  test.beforeAll(async ({ request }) => {
    admin = await seedAdmin()
    pro = await signupProfessional(request, { organisationKind: 'FIRM' })
    await setTenantOverride(request, admin, 'counsel_surfaces', pro.tenantId, true)
  })

  test.afterAll(async ({ request }) => {
    if (pro) await clearTenantOverride(request, admin, 'counsel_surfaces', pro.tenantId).catch(() => {})
    if (pro) await removeProfessional(pro).catch(() => {})
    if (admin) await removeAdmin(admin).catch(() => {})
  })

  test('sign in → empty state → open a direct appeal → TRAP clock and uploader → the organisation shows the owner', async ({ page }) => {
    await signInThroughPage(page, pro.email)
    await expect(page).toHaveURL(/\/counsel$/)
    await expect(page.getByTestId('professional-nav')).toContainText('Matters')
    await expect(page.getByTestId('professional-nav')).not.toContainText('Your reviews')
    await expect(page.getByTestId('matters-empty')).toContainText('No matters yet')
    await expectAxeClean(page)

    await page.getByTestId('open-matter').click()
    await expect(page).toHaveURL(/\/counsel\/matters\/new$/)
    await page.getByTestId('vehicle-direct_appeal').check()
    await page.getByLabel(/^County/).fill('Bexar')
    await page.getByLabel(/^Court/).fill('144th District Court')
    await page.getByLabel(/^Cause number/).fill('2019-CR-0001')
    await page.getByLabel(/^Client initials/).fill('JF')
    await page.getByLabel(/^Sentence imposed/).fill('2026-09-01')
    await page.getByLabel(/^Notice of appeal/).fill('2026-09-20')
    await expectAxeClean(page)
    await page.getByTestId('matter-submit').click()

    await expect(page).toHaveURL(/\/counsel\/matters\/[A-Za-z0-9_-]+$/, { timeout: 20_000 })
    await expect(page.getByTestId('matter-title')).toContainText('JF — Direct appeal')
    await expect(page.getByTestId('matter-status')).toContainText('Awaiting record')
    const clock = page.getByTestId('trap-clock')
    await expect(clock).toContainText('TRAP clock')
    await expect(clock).toContainText('26.2')
    await expect(clock).toContainText('Jurisdictional')
    await expect(page.getByTestId('trap-disclaimer')).toContainText('proposed until counsel signs')
    const uploader = page.getByTestId('record-uploader')
    await expect(uploader).toBeVisible()
    await expect(uploader.getByTestId('volume-kind')).toHaveValue('REPORTER')
    await expect(page.getByTestId('record-inventory')).toContainText('No volumes yet')
    await expectAxeClean(page)

    await page.getByTestId('professional-nav').getByRole('link', { name: 'Matters' }).click()
    await expect(page.getByTestId('matters-table')).toContainText('JF — Direct appeal')
    await expect(page.getByTestId('matters-table')).toContainText('Awaiting record')

    await page.getByTestId('professional-nav').getByRole('link', { name: 'Organisation' }).click()
    await expect(page).toHaveURL(/\/counsel\/org$/)
    await expect(page.getByTestId('org-name')).toContainText('Lopez Appellate')
    const owner = page.getByTestId('member-OWNER')
    await expect(owner).toContainText('Maria Lopez')
    await expect(owner).toContainText('Owner')
    await expect(page.getByTestId('invite-form')).toBeVisible()
    await expectAxeClean(page)

    await page.getByTestId('professional-nav').getByRole('link', { name: 'Account' }).click()
    await expect(page.getByTestId('profile')).toContainText('24099999')
    await expect(page.getByTestId('profile')).toContainText('Pending verification')
  })

  test('a professional whose tenant is still dark sees the same "Not available" 404 the api answers', async ({ page, request }) => {
    const dark = await signupProfessional(request, { organisationName: `dark ${Date.now()}` })
    try {
      await signInThroughPage(page, dark.email)
      await expect(page.getByTestId('not-available')).toContainText('Not available')
      await expect(page.getByTestId('not-available')).toContainText('404')
      await expect(page.getByTestId('matters-empty')).toHaveCount(0)
    } finally {
      await removeProfessional(dark).catch(() => {})
    }
  })

  test('/for-counsel/signup: closed while the global flag is off; the form signs a new professional up when it is on', async ({ page, request }) => {
    await page.goto('/for-counsel/signup')
    await expect(page.getByTestId('signups-closed')).toContainText('Sign-ups open January 2027')
    await expectAxeClean(page)

    await setGlobalFlag(request, admin, 'counsel_surfaces', true)
    const email = `${Date.now()}_ui@example.com`
    let created: Professional | null = null
    try {
      await page.goto('/for-counsel/signup')
      await expect(page.getByTestId('counsel-signup-form')).toBeVisible({ timeout: 20_000 })
      await page.locator('#signup-email').fill(email)
      await page.getByTestId('password-input').fill('CorrectHorse9Battery!')
      await page.locator('#signup-name').fill('Dana Reyes')
      await page.locator('#signup-bar').fill('24088888')
      await page.locator('#signup-practice').selectOption('writ')
      await page.locator('#signup-org').fill(`UI ${Date.now()} Reyes Law`)
      await expectAxeClean(page)
      await page.getByTestId('signup-submit').click()
      await page.waitForURL(/\/counsel$/, { timeout: 30_000 })
      await expect(page.getByTestId('matters-empty')).toBeVisible({ timeout: 20_000 })
      created = await findProfessional(email)
    } finally {
      await setGlobalFlag(request, admin, 'counsel_surfaces', false)
      if (created) await removeProfessional(created).catch(() => {})
    }
  })
})
