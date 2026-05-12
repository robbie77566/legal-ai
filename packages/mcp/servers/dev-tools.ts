import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const server = new Server(
  {
    name: 'mcp-dev-tools',
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
        name: 'read_file_content',
        description: 'Reads the content of a specific file in the repository.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Path to the file to read, relative to repository root.' },
          },
          required: ['filePath'],
        },
      },
      {
        name: 'search_codebase',
        description: 'Searches the codebase for a specific pattern using ripgrep or grep.',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex or string pattern to search for.' },
            dirPath: { type: 'string', description: 'Optional directory to search in. Defaults to root.' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'validate_architecture',
        description: 'Validates code implementation against the architecture documents.',
        inputSchema: {
          type: 'object',
          properties: {
            component: { type: 'string', description: 'The component or topic to validate (e.g., Database, State Management).' },
          },
          required: ['component'],
        },
      }
    ],
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'read_file_content') {
    const { filePath } = request.params.arguments as any
    try {
      const content = await fs.readFile(path.resolve(process.cwd(), filePath), 'utf-8')
      return {
        content: [{ type: 'text', text: content }],
      }
    } catch (e: any) {
      return {
        content: [{ type: 'text', text: `Error reading file: ${e.message}` }],
        isError: true,
      }
    }
  } else if (request.params.name === 'search_codebase') {
    const { pattern, dirPath = '.' } = request.params.arguments as any
    try {
      // Assuming a unix-like environment for grep; ripgrep could be better if installed
      const { stdout } = await execAsync(`grep -rn "${pattern}" ${dirPath}`)
      return {
        content: [{ type: 'text', text: stdout || 'No matches found.' }],
      }
    } catch (e: any) {
      return {
        content: [{ type: 'text', text: `Search error: ${e.message}` }],
        isError: true,
      }
    }
  } else if (request.params.name === 'validate_architecture') {
    const { component } = request.params.arguments as any
    try {
      const archDoc = await fs.readFile(path.resolve(process.cwd(), 'docs/architecture/website_architecture.md'), 'utf-8')
      // For a real RAG implementation, this would query a vector DB.
      // Here we simulate by just returning the relevant document piece or full document snippet for the LLM to process.
      return {
        content: [{ type: 'text', text: `Reviewing component '${component}'. Architectural guidelines state:\n\n${archDoc.substring(0, 1500)}...` }],
      }
    } catch (e: any) {
      return {
        content: [{ type: 'text', text: `Architecture validation error: ${e.message}` }],
        isError: true,
      }
    }
  }
  throw new Error('Tool not found')
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('dev-tools MCP server running on stdio')
}

main().catch(console.error)
