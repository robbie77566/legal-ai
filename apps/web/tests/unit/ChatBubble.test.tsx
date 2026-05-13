import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBubble } from '@/components/ChatBubble';

describe('ChatBubble', () => {
  it('renders a user message with correct styling', () => {
    render(<ChatBubble msg={{ role: 'user', text: 'Hello AI' }} />);
    const msgEl = screen.getByText('Hello AI');
    expect(msgEl).toBeInTheDocument();
    expect(msgEl.parentElement).toHaveClass('bg-[#161B22]');
  });

  it('renders an agent message with correct styling', () => {
    render(<ChatBubble msg={{ role: 'agent', text: 'Here is your draft.' }} />);
    const msgEl = screen.getByText('Here is your draft.');
    expect(msgEl).toBeInTheDocument();
    expect(msgEl.parentElement).toHaveClass('bg-[#D4AF37]/10');
  });

  it('renders a status message with pulsing style', () => {
    render(<ChatBubble msg={{ role: 'status', text: 'Thinking...' }} />);
    const msgEl = screen.getByText('Thinking...');
    expect(msgEl.parentElement).toHaveClass('animate-pulse');
  });
});
