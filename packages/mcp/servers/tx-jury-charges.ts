import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  {
    name: 'mcp-tx-jury-charges',
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
        name: 'audit_preservation',
        description: 'Audits a jury charge objection for preservation of error under Almanza v. State.',
        inputSchema: {
          type: 'object',
          properties: {
            charge_text: { type: 'string', description: 'The text of the jury charge.' },
            objection_made: { type: 'boolean', description: 'Whether an objection was made at trial.' },
          },
          required: ['charge_text', 'objection_made'],
        },
      },
      {
        name: 'get_pattern_jury_charge',
        description: 'Retrieves the Texas Pattern Jury Charge for a specific offense.',
        inputSchema: {
          type: 'object',
          properties: {
            offense: { type: 'string', description: 'The penal code offense.' },
          },
          required: ['offense'],
        },
      }
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'audit_preservation') {
    const { charge_text, objection_made } = request.params.arguments as any
    const standard = objection_made ? 'Some Harm' : 'Egregious Harm'
    return {
      content: [
        {
          type: 'text',
          text: `Preservation Audit: Objection ${objection_made ? 'was' : 'was not'} made. The applicable standard of review is ${standard} under Almanza.`,
        },
      ],
    }
  } else if (request.params.name === 'get_pattern_jury_charge') {
    const { offense } = request.params.arguments as any
    return {
      content: [
        {
          type: 'text',
          text: `Pattern Jury Charge for ${offense}: ...`,
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
