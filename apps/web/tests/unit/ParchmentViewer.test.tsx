import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParchmentViewer } from '@/components/ParchmentViewer';

describe('ParchmentViewer', () => {
  it('renders a list of documents and responds to mouseup', () => {
    const handleMouseUp = vi.fn();
    const mockDocuments = [
      { filename: 'test_transcript.pdf' },
      { filename: 'exhibit_A.png' }
    ];
    
    render(<ParchmentViewer onMouseUp={handleMouseUp} documents={mockDocuments} />);

    expect(screen.getByText('Case Documents')).toBeInTheDocument();
    expect(screen.getByText('test_transcript.pdf')).toBeInTheDocument();
    expect(screen.getByText('exhibit_A.png')).toBeInTheDocument();

    const container = screen.getByTestId('parchment-viewer');
    fireEvent.mouseUp(container);
    expect(handleMouseUp).toHaveBeenCalled();
  });

  it('renders an empty state when no documents are provided', () => {
    const handleMouseUp = vi.fn();
    render(<ParchmentViewer onMouseUp={handleMouseUp} documents={[]} />);

    expect(screen.getByText('Case Documents')).toBeInTheDocument();
    expect(screen.getByText('No documents have been attached to this case yet.')).toBeInTheDocument();
  });
});
