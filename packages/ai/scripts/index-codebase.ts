import 'dotenv/config'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings } from '@langchain/ollama'
import { connect } from '@lancedb/lancedb'
import { glob } from 'glob'
import * as fs from 'fs/promises'
import * as path from 'path'

const LANCEDB_URI = path.join(process.cwd(), '.lancedb')

export async function indexCodebase() {
  console.log('🔍 Starting Codebase RAG Indexing Pipeline...')

  // 1. Traverse Repository (ignoring hidden and build directories)
  console.log('📂 Scanning for files...')
  const filePaths = await glob('**/*.{ts,tsx,md}', {
    ignore: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      '.git/**',
      '.turbo/**',
      'playwright-report/**',
      'test-results/**'
    ]
  })
  console.log(`Found ${filePaths.length} files.`)

  // 2. Chunk Documents
  console.log('✂️ Chunking documents...')
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200
  })

  const documents = []
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const chunks = await splitter.splitText(content)
      
      for (let i = 0; i < chunks.length; i++) {
        documents.push({
          id: `${filePath}-${i}`,
          content: chunks[i],
          filePath: filePath,
          chunkIndex: i
        })
      }
    } catch (e) {
      console.warn(`Could not process ${filePath}`, e)
    }
  }
  console.log(`Generated ${documents.length} chunks.`)

  if (documents.length === 0) {
    console.log('No documents found to index.')
    return
  }

  // We use local Ollama to avoid API costs
  console.log('🧠 Generating Embeddings & Saving to LanceDB (nomic-embed-text)...')

  const embeddings = new OllamaEmbeddings({
    model: 'nomic-embed-text',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  })

  // We embed the text in batches to avoid API rate limits
  const BATCH_SIZE = 50
  const lancedbData = []

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    console.log(`Embedding batch ${i} to ${i + BATCH_SIZE}...`)
    const batch = documents.slice(i, i + BATCH_SIZE)
    const texts = batch.map(d => d.content)
    
    // We append the filepath so the semantic context captures the file origin
    const enrichedTexts = batch.map(d => `File: ${d.filePath}\n\n${d.content}`)
    
    const embeddedVectors = await embeddings.embedDocuments(enrichedTexts)
    
    if (i === 0) {
      console.log('Sample vector length:', embeddedVectors[0]?.length)
      console.log('Sample vector type:', typeof embeddedVectors[0])
    }
    
    for (let j = 0; j < batch.length; j++) {
      if (embeddedVectors[j] && embeddedVectors[j].length > 0) {
        lancedbData.push({
          id: batch[j].id,
          vector: Array.from(embeddedVectors[j]),
          text: batch[j].content,
          filePath: batch[j].filePath
        })
      }
    }
  }

  const db = await connect(LANCEDB_URI)
  
  // Drop table if exists to effectively "reindex"
  const tableNames = await db.tableNames()
  if (tableNames.includes('codebase')) {
    await db.dropTable('codebase')
  }

  // Create table
  const table = await db.createTable('codebase', lancedbData)
  
  console.log(`✅ Successfully indexed ${lancedbData.length} vectors into LanceDB at ${LANCEDB_URI}`)
}

if (process.env.NODE_ENV !== 'test') {
  indexCodebase().catch(console.error)
}
