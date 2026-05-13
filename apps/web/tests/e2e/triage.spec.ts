import { test, expect } from '@playwright/test';

test.describe('Clinic Triage Workflow', () => {
  test('should display scorecard only after file processing', async ({ page }) => {
    // Navigate
    await page.goto('http://localhost:3000/dashboard');

    // Attach file to hidden input
    await page.locator('input[type="file"]').setInputFiles('/home/tanteo/src/legal-ai/Test Case Files/Brian_spinks.zip');

    // Wait for the modal to open
    await expect(page.getByText('Setup New Case')).toBeVisible();

    // Fill the case details
    await page.getByPlaceholder('e.g., State v. Smith').fill('Brian Spinks Triage');
    await page.getByPlaceholder('John Smith').fill('Brian Spinks');

    // Click "Save & Analyze"
    await page.getByRole('button', { name: 'Save & Analyze' }).click();

    // Verify the UI enters the processing state
    await expect(page.getByText('LangGraph Agents Analyzing...')).toBeVisible();

    // Wait for the Scorecard to appear after processing
    // It might take longer than 6 seconds if S3 upload and API are slow
    await expect(page.getByText('Viability Scorecard')).toBeVisible({ timeout: 15000 });
    
    // Verify Quick Actions appear
    await expect(page.getByText('Quick Actions')).toBeVisible();

    // Click "Open Workspace" to transition to the Side-by-Side viewer
    await page.getByRole('link', { name: /Open Workspace/i }).click();

    // Verify the Workspace has loaded correctly
    await expect(page.getByRole('heading', { name: 'HabeasGraph Workspace' })).toBeVisible();
  });
});
