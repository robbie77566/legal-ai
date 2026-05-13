import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HeroGraph from '@/components/HeroGraph';

describe('HeroGraph', () => {
  it('renders the graph container', () => {
    render(<HeroGraph />);
    expect(screen.getByTestId('hero-graph-container')).toBeInTheDocument();
  });
});
