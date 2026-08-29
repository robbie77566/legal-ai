import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const searchPenalCode = tool(
  async ({ query }: { query: string }) => {
    console.log(`[MCP] Searching TX Penal Code for: ${query}`);
    return JSON.stringify([
      { section: "19.02", title: "Murder", text: "A person commits an offense if he intentionally or knowingly causes the death of an individual..." }
    ]);
  },
  {
    name: "search_penal_code",
    description: "Semantic search across the Texas Penal Code.",
    schema: z.object({
      query: z.string().describe("The search query.")
    })
  }
);

export const getStatuteByDate = tool(
  async ({ section, effectiveDate }: { section: string; effectiveDate: string }) => {
    console.log(`[MCP] Getting TX Statute ${section} effective ${effectiveDate}`);
    return JSON.stringify({
      section,
      effectiveDate,
      text: "Historical statute text..."
    });
  },
  {
    name: "get_statute_by_date",
    description: "Retrieves the law as it existed at the time of the offense to prevent ex post facto issues.",
    schema: z.object({
      section: z.string().describe("The statute section number."),
      effectiveDate: z.string().describe("The date the offense occurred (YYYY-MM-DD).")
    })
  }
);
