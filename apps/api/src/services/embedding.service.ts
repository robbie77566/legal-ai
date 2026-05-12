import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY || '')

export class EmbeddingService {
  static async embed(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
    const result = await model.embedContent(text)
    return result.embedding.values
  }
}
