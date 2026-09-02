import { test, expect } from '@playwright/test'

/**
 * Public-surface smoke (CI E2E): the brand site + conversion landing render
 * in a real browser with no API behind them. Catches broken pages, dead
 * CTAs, and the language switch — not business logic (that's vitest).
 * Replaced the pre-pivot HabeasGraph specs 2026-09-02.
 */
test.describe('public site smoke', () => {
  test('brand home renders and every free-check CTA routes to /check', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('court record')
    await expect(page.getByText('This is not for every case')).toBeVisible()
    // CTAs are the "free check" buttons — NOT the learn card whose blurb
    // happens to end in "free" (that one routes to the documents guide).
    const ctas = page.getByRole('link', { name: /free check|case fits — free/i })
    expect(await ctas.count()).toBeGreaterThanOrEqual(2)
    for (const href of await ctas.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href).toBe('/check')
    }
  })

  test('conversion landing at /review keeps its hero and price framing', async ({ page }) => {
    await page.goto('/review')
    await expect(page.locator('h1')).toContainText(/really in the court record/i)
    await expect(page.getByText(/\$299\. One price/)).toBeVisible()
  })

  test('language switch flips the landing to Spanish and persists across pages', async ({ page }) => {
    await page.goto('/review')
    await page.getByTestId('lang-switch').click()
    await expect(page.locator('h1')).toContainText(/expediente/i)
    await page.goto('/pricing')
    await expect(page.locator('h1')).toContainText('Un solo precio')
  })

  test('pricing, faq, sample report, and the documents guide all render', async ({ page }) => {
    for (const [path, text] of [
      ['/pricing', 'One price: $299'],
      ['/faq', 'Your questions, answered'],
      ['/sample-report', 'fictional case'],
      ['/how-to-get-documents', /documents/i],
    ] as const) {
      await page.goto(path)
      await expect(page.locator('main')).toContainText(text)
    }
  })

  test('footer carries the operator and the no-legal-advice line', async ({ page }) => {
    await page.goto('/')
    const footer = page.locator('footer')
    await expect(footer).toContainText('Tangent Software LLC')
    await expect(footer).toContainText('not a law firm')
  })
})
