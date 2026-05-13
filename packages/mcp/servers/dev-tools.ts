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
import { connect } from '@lancedb/lancedb'
import { OllamaEmbeddings } from '@langchain/ollama'

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
        name: 'search_semantic_codebase',
        description: 'Performs a semantic search across the entire codebase to find relevant code snippets or documentation based on natural language queries. Uses the RAG Vector DB.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The natural language query (e.g., "How does the ingestion worker handle embeddings?").' },
            limit: { type: 'number', description: 'Number of results to return. Defaults to 5.' },
          },
          required: ['query'],
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
  } else if (request.params.name === 'search_semantic_codebase') {
    const { query, limit = 5 } = request.params.arguments as any
    try {
      const LANCEDB_URI = path.join(process.cwd(), '.lancedb')
      const db = await connect(LANCEDB_URI)
      const tableNames = await db.tableNames()
      
      if (!tableNames.includes('codebase')) {
        return {
          content: [{ type: 'text', text: 'Error: Codebase index not found. Please run `pnpm run rag:index` first.' }],
          isError: true,
        }
      }

      const table = await db.openTable('codebase')
      
      const embeddings = new OllamaEmbeddings({
        model: 'nomic-embed-text',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      })
      const queryVector = await embeddings.embedQuery(query)

      const results = await table
        .search(queryVector)
        .limit(limit)
        .execute()

      const formattedResults = results.map((r: any) => `### File: ${r.filePath}\n\n${r.text}`).join('\n\n---\n\n')

      return {
        content: [{ type: 'text', text: `Semantic Search Results for: "${query}"\n\n${formattedResults}` }],
      }
    } catch (e: any) {
      return {
        content: [{ type: 'text', text: `Semantic search error: ${e.message}` }],
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
