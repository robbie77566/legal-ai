import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViabilityScorecard } from '@/components/ViabilityScorecard';

describe('ViabilityScorecard', () => {
  it('renders correctly with given scores', () => {
    const mockScores = [
      { type: 'Strickland (IAC)', status: 'High Probability', color: 'text-green-500', icon: <span>Icon</span>, desc: 'Failure to object.' },
      { type: 'Brady Violation', status: 'Moderate', color: 'text-yellow-500', icon: <span>Icon2</span>, desc: 'Discrepancy.' }
    ];

    render(<ViabilityScorecard scores={mockScores} />);

    // Verify Title
    expect(screen.getByText('Viability Scorecard')).toBeInTheDocument();
    
    // Verify first card
    expect(screen.getByText('Strickland (IAC)')).toBeInTheDocument();
    expect(screen.getByText('High Probability')).toBeInTheDocument();
    expect(screen.getByText('Failure to object.')).toBeInTheDocument();

    // Verify second card
    expect(screen.getByText('Brady Violation')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    
    // Verify 2 cards were rendered using the test ids
    expect(screen.getByTestId('scorecard-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('scorecard-item-1')).toBeInTheDocument();
  });
});
