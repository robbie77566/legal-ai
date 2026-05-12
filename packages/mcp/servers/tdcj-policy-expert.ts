import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const server = new Server(
  {
    name: 'mcp-tdcj-policy-expert',
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
        name: 'get_parole_eligibility',
        description: 'Retrieves parole eligibility rules based on the offense and sentence date.',
        inputSchema: {
          type: 'object',
          properties: {
            offense: { type: 'string', description: 'The penal code offense.' },
            sentence_date: { type: 'string', description: 'The date of sentencing.' },
          },
          required: ['offense', 'sentence_date'],
        },
      },
      {
        name: 'get_good_time_credit_rules',
        description: 'Retrieves TDCJ good conduct time credit rules.',
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
  if (request.params.name === 'get_parole_eligibility') {
    const { offense, sentence_date } = request.params.arguments as any
    return {
      content: [
        {
          type: 'text',
          text: `Parole Eligibility for ${offense} sentenced on ${sentence_date}: Must serve 50% of the sentence.`,
        },
      ],
    }
  } else if (request.params.name === 'get_good_time_credit_rules') {
    const { offense } = request.params.arguments as any
    return {
      content: [
        {
          type: 'text',
          text: `Good Time Credit rules for ${offense}: Eligible for 20 days per month of flat time served.`,
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
