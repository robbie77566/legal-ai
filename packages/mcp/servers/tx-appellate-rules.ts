import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  {
    name: 'mcp-tx-appellate-rules',
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
        name: 'get_trap_deadline',
        description: 'Retrieves the Texas Rules of Appellate Procedure (TRAP) deadline for a specific event.',
        inputSchema: {
          type: 'object',
          properties: {
            event_type: { type: 'string', description: 'The type of appellate event (e.g., notice_of_appeal, brief_filing)' },
            trigger_date: { type: 'string', description: 'The date the triggering event occurred (e.g., judgment_date)' },
          },
          required: ['event_type', 'trigger_date'],
        },
      },
      {
        name: 'get_appellate_formatting',
        description: 'Retrieves formatting rules for Texas appellate briefs.',
        inputSchema: {
          type: 'object',
          properties: {
            document_type: { type: 'string', description: 'The type of document (e.g., brief, petition, writ)' },
          },
          required: ['document_type'],
        },
      }
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'get_trap_deadline') {
    const { event_type, trigger_date } = request.params.arguments as any
    // Logic to calculate deadline
    return {
      content: [
        {
          type: 'text',
          text: `Deadline for ${event_type} triggered on ${trigger_date} is [Calculated Date].`,
        },
      ],
    }
  } else if (request.params.name === 'get_appellate_formatting') {
    const { document_type } = request.params.arguments as any
    return {
      content: [
        {
          type: 'text',
          text: `Formatting rules for ${document_type}: Font size 14, 1-inch margins, Word count limit applies.`,
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
