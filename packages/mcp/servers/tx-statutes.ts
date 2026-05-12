import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  {
    name: 'mcp-tx-statutes-pro',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_statute_by_date',
        description: 'Retrieves the Texas law as it existed at the time of the offense.',
        inputSchema: {
          type: 'object',
          properties: {
            section: { type: 'string' },
            effective_date: { type: 'string' },
          },
          required: ['section', 'effective_date'],
        },
      },
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_statute_by_date') {
    const { section, effective_date } = request.params.arguments as any
    // Logic to fetch historical statute
    return {
      content: [
        {
          type: 'text',
          text: `Historical statute text for ${section} on ${effective_date}...`,
        },
      ],
    }
  }
  throw new Error('Tool not found')
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
