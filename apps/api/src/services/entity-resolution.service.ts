import axios from 'axios'

export class EntityResolutionService {
  private static ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'

  static async extractEntities(text: string): Promise<string[]> {
    const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
      model: 'llama3',
      prompt: `Extract names of witnesses, evidence items, and charges from the following legal text. Return as a JSON array of strings: ${text}`,
      stream: false,
    })

    try {
      const result = JSON.parse(response.data.response)
      return result
    } catch (e) {
      console.error('Failed to parse entity extraction result:', e)
      return []
    }
  }

  static async resolveEntity(entityName: string): Promise<string> {
    // This would contain the logic to compare against existing Neo4j nodes
    // and return a normalized ID or Name.
    return entityName.trim().toLowerCase()
  }
}
