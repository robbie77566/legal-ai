import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const searchBodycamAudio = tool(
  async ({ query }) => {
    console.log(`[MCP] Searching bodycam transcripts for: ${query}`);
    return JSON.stringify([
      { timestamp: "00:15:32", text: "OFFICER: Put your hands up.", confidence: 0.98 }
    ]);
  },
  {
    name: "search_bodycam_audio",
    description: "Search the Whisper-transcribed audio from Axon bodycams or jail calls.",
    schema: z.object({
      query: z.string().describe("The dialogue or keyword to search for.")
    })
  }
);
