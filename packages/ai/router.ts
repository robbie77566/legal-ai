import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOllama } from '@langchain/community/chat_models/ollama'

export class ModelRouter {
  private primary: ChatGoogleGenerativeAI
  private secondary: ChatOllama

  constructor() {
    this.primary = new ChatGoogleGenerativeAI({
      modelName: 'gemini-1.5-pro',
    })
    this.secondary = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: 'llama3:70b',
    })
  }

  async predict(messages: any[]) {
    try {
      return await this.primary.invoke(messages)
    } catch (error) {
      console.warn('Gemini failed, falling back to Ollama:', error)
      return await this.secondary.invoke(messages)
    }
  }
}
