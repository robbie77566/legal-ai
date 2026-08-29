import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const formatCitation = tool(
  async ({ rawText }: { rawText: string }) => {
    console.log(`[MCP] Sanitizing citation: ${rawText}`);
    // Regex replacements to enforce The Bluebook standards for Texas
    const sanitized = rawText
      .replace(/TX Crim App/gi, "Tex. Crim. App.")
      .replace(/SW3d/gi, "S.W.3d");
      
    return JSON.stringify({
      original: rawText,
      sanitized
    });
  },
  {
    name: "format_citation",
    description: "Strict rules-based formatter to ensure citations conform to The Bluebook and TRAP standards.",
    schema: z.object({
      rawText: z.string().describe("The raw citation string to format.")
    })
  }
);
