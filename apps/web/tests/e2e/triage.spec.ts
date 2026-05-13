import { test, expect } from '@playwright/test';

test.describe('Clinic Triage Workflow with SSE Streaming', () => {
  test('should extract metadata, display SSE stream, and auto-redirect', async ({ page }) => {
    // Mock Session with real Database IDs
    await page.route('**/api/auth/session', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { name: 'System Administrator', email: 'admin@habeasgraph.local', role: 'ADMIN', tenantId: 'system-tenant', id: 'cmp1z0xrw000112g3d7uvrrwd' },
          expires: '9999-12-31T23:59:59.999Z'
        })
      });
    });

    const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

    // Mock AI Metadata Extraction (to keep test fast and save tokens)
    await page.route('http://localhost:3001/cases/preview-metadata', async route => {
      await new Promise(r => setTimeout(r, 1000));
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
        body: JSON.stringify({
          name: 'AI Suggested Name',
          defendant: 'AI Defendant',
          jurisdiction: 'AI Jurisdiction'
        })
      });
    });

    // Mock EventSource for SSE testing (keeps test reliable without needing Redis workers)
    await page.addInitScript(() => {
      class MockEventSource {
        url: string;
        onmessage: ((event: any) => void) | null = null;
        onerror: ((event: any) => void) | null = null;

        constructor(url: string) {
          this.url = url;
          // Emit events shortly after creation
          setTimeout(() => {
            if (this.onmessage) {
              this.onmessage({ data: JSON.stringify({ status: 'processing', message: 'Mocking vector extraction...', source: 'entity' }) });
              this.onmessage({ data: JSON.stringify({ status: 'processing', message: 'Mocking graph extraction...', source: 'graph' }) });
            }
          }, 500);

          // Emit complete event to trigger redirect
          setTimeout(() => {
            if (this.onmessage) {
              this.onmessage({ data: JSON.stringify({ status: 'complete', message: 'Done.', source: 'system' }) });
            }
          }, 2000);
        }

        close() {}
      }
      (window as any).EventSource = MockEventSource;
    });

    // Navigate to Dashboard
    await page.goto('http://localhost:3000/dashboard');

    // Attach file
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test_document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake pdf content')
    });

    // Wait for the modal to open
    await expect(page.getByText('Setup New Case')).toBeVisible();

    // Verify AI loading state appears
    await expect(page.getByText('AI is analyzing document for case details')).toBeVisible();

    // Verify AI fields get populated
    await expect(page.getByPlaceholder('e.g., State v. Smith')).toHaveValue('AI Suggested Name');
    await expect(page.getByPlaceholder('John Smith')).toHaveValue('AI Defendant');

    // Click "Save & Analyze"
    await page.getByRole('button', { name: 'Save & Analyze' }).click();

    // Verify SSE Processing UI
    await expect(page.getByText('LangGraph Agents Analyzing...')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Mocking vector extraction...')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Mocking graph extraction...')).toBeVisible({ timeout: 15000 });

    // Verify Auto-Redirect to Workspace upon completion
    await expect(page).toHaveURL(/.*\/workspace\/.*/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'HabeasGraph Workspace' })).toBeVisible({ timeout: 10000 });
  });
});
