import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import KnowledgeGraph from '@/components/KnowledgeGraph';

// KnowledgeGraph relies on ResizeObserver which is not present in JSDOM
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserver;

describe('KnowledgeGraph', () => {
  it('renders the container correctly', () => {
    // Provide some mock data
    render(<KnowledgeGraph data={{ nodes: [], links: [] }} />);
    // Verify it mounted by checking if the container exists
    expect(screen.getByTestId('knowledge-graph-container')).toBeInTheDocument();
  });
});
