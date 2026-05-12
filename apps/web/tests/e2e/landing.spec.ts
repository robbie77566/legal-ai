import { test, expect } from '@playwright/test';

test.describe('HabeasGraph Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should render the Hero section with dynamic typography', async ({ page }) => {
    // Assert the main header exists
    await expect(page.locator('h1')).toContainText('Texas Post-Conviction');
    await expect(page.locator('h1')).toContainText('Advocacy, Untangled.');

    // Assert the CTA button exists and is visible
    const ctaButton = page.getByRole('button', { name: /Initialize Workspace/i });
    await expect(ctaButton).toBeVisible();
  });

  test('should navigate to the dashboard when CTA is clicked', async ({ page }) => {
    const ctaButton = page.getByRole('button', { name: /Initialize Workspace/i });
    await ctaButton.click();

    // After clicking, it should route to /dashboard
    await expect(page).toHaveURL(/.*\/dashboard/);
  });

  test('should display the Bento Grid features', async ({ page }) => {
    // Scroll to the features section
    await expect(page.locator('h2', { hasText: 'Institutional-Grade Workflows' })).toBeVisible();

    // Verify all 3 persona cards exist
    await expect(page.locator('h3', { hasText: 'Triage Engine' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Chronological Web' })).toBeVisible();
    await expect(page.locator('h3', { hasText: 'Parchment Drafting' })).toBeVisible();
  });

  test('should display the institutional security footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toContainText('Zero-Retention AI');
    await expect(footer).toContainText('Immutable Audit Logs');
    await expect(footer).toContainText('RLS Tenant Isolation');
  });
});
