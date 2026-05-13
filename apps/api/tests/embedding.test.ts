import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmbeddingService } from '../src/services/embedding.service';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock the @google/generative-ai module
vi.mock('@google/generative-ai', () => {
  const embedContentMock = vi.fn();
  const getGenerativeModelMock = vi.fn(() => ({
    embedContent: embedContentMock,
  }));
  return {
    GoogleGenerativeAI: vi.fn(() => ({
      getGenerativeModel: getGenerativeModelMock,
    })),
  };
});

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call Google Generative AI to embed text and return values', async () => {
    const mockValues = [0.1, 0.2, 0.3];
    
    // Get the mocked instance
    const genAIInstance = new GoogleGenerativeAI('test-key');
    const mockModel = genAIInstance.getGenerativeModel({ model: 'test' });
    
    // Setup the specific mock return for this test
    vi.mocked(mockModel.embedContent).mockResolvedValueOnce({
      embedding: { values: mockValues }
    } as any);

    const result = await EmbeddingService.embed('test string');

    expect(result).toEqual(mockValues);
    expect(mockModel.embedContent).toHaveBeenCalledWith('test string');
  });
});
