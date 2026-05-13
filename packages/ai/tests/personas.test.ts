import { describe, it, expect } from 'vitest';
import { AgentPersonas } from '../personas';

describe('AI Personas Configuration', () => {
  it('should export an IAC Specialist persona with correct IRAC instruction', () => {
    const iac = AgentPersonas.iac_specialist;
    expect(iac.name).toBe('IAC Specialist');
    expect(iac.systemPrompt).toContain('IRAC format');
    expect(iac.systemPrompt).toContain('Page/Line numbers');
  });

  it('should export an Appellate Auditor persona with four-corners review instruction', () => {
    const appellate = AgentPersonas.appellate_auditor;
    expect(appellate.name).toBe('Appellate Auditor');
    expect(appellate.systemPrompt).toContain('Four Corners');
    expect(appellate.systemPrompt).toContain('Almanza');
  });

  it('should have 8 defined personas for the graph routing', () => {
    const personasCount = Object.keys(AgentPersonas).length;
    expect(personasCount).toBe(8);
  });
});
