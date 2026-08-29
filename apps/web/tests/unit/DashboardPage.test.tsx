import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BentoDashboard from '@/app/dashboard/page';

// Mock the ViabilityScorecard component to simplify testing
vi.mock('@/components/ViabilityScorecard', () => ({
  ViabilityScorecard: () => <div data-testid="mock-viability-scorecard">Scorecard Mock</div>
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

describe('BentoDashboard', () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ success: true, caseId: 'CASE-1234', url: 'http://mock-s3-url', s3Key: 'mock-s3-key' }),
        ok: true
      })
    ) as any;

    class MockEventSource {
      onmessage: any;
      onerror: any;
      constructor() {
        setTimeout(() => {
          if (this.onmessage) {
            this.onmessage({ data: JSON.stringify({ message: 'done', status: 'complete' }) });
          }
        }, 100);
      }
      close() {}
    }
    (global as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the initial state correctly', () => {
    render(<BentoDashboard />);
    expect(screen.getByText('HabeasGraph Litigation Triage')).toBeInTheDocument();
    expect(screen.getByText('Drop Files to Auto-Generate Case')).toBeInTheDocument();
    expect(screen.getByText('How it Works')).toBeInTheDocument();
    expect(screen.getByText('Recent Case Workspaces')).toBeInTheDocument();
  });

  it('triggers the simulation workflow on drop or click', async () => {
    // Mock alert for toasts
    window.alert = vi.fn();
    
    render(<BentoDashboard />);
    
    // Simulate attaching a file
    const fileInput = screen.getByTestId('file-upload-input');
    const file = new File(['hello'], 'hello.zip', { type: 'application/zip' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    
    // Expect Modal to appear
    expect(screen.getByText('Setup New Case')).toBeInTheDocument();
    expect(screen.getByText('hello.zip')).toBeInTheDocument();
    
    // Fill out the form
    const caseNameInput = screen.getByPlaceholderText('e.g., State v. Smith');
    fireEvent.change(caseNameInput, { target: { value: 'Test Case' } });
    
    const submitBtn = screen.getByText('Save & Analyze');
    fireEvent.click(submitBtn);

    // Should transition to processing state
    expect(screen.getByText('LangGraph Agents Analyzing...')).toBeInTheDocument();
    
    // Wait for the processing to finish (mock fetch resolves instantly)
    await waitFor(() => {
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });
    
    // Expect the Viability Scorecard to render after processing
    expect(screen.getByTestId('mock-viability-scorecard')).toBeInTheDocument();
    
    // Test the quick action alert
    const assignBtn = screen.getByText('Assign Investigator');
    fireEvent.click(assignBtn);
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Investigator Assigned to'));
  }, 10000);
});
