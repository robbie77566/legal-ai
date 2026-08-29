import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOllama } from '@langchain/ollama'
import type { BaseMessage } from '@langchain/core/messages'

export class ModelRouter {
  private primary: ChatOllama
  private secondary: ChatGoogleGenerativeAI

  constructor() {
    this.primary = new ChatOllama({
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: 'llama3:70b',
    })
    this.secondary = new ChatGoogleGenerativeAI({
      model: 'gemini-1.5-pro',
    })
  }

  async predict(messages: BaseMessage[]) {
    try {
      return await this.primary.invoke(messages)
    } catch (error) {
      console.warn('Ollama failed, falling back to Gemini:', error)
      return await this.secondary.invoke(messages)
    }
  }
}
