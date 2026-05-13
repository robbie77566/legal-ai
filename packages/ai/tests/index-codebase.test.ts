import { describe, it, expect, vi, beforeEach } from 'vitest';
import { indexCodebase } from '../scripts/index-codebase';
import * as fs from 'fs/promises';
import { glob } from 'glob';

// Mock dependencies
vi.mock('glob', () => ({
  glob: vi.fn()
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockResolvedValue({
    tableNames: vi.fn().mockResolvedValue(['codebase']),
    dropTable: vi.fn().mockResolvedValue(true),
    createTable: vi.fn().mockResolvedValue(true)
  })
}));

vi.mock('@langchain/ollama', () => {
  return {
    OllamaEmbeddings: vi.fn().mockImplementation(() => {
      return {
        embedDocuments: vi.fn().mockResolvedValue([
          [0.1, 0.2, 0.3], // Mock vector 1
          [0.4, 0.5, 0.6]  // Mock vector 2
        ])
      };
    })
  };
});

describe('LanceDB Codebase Indexing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should read files, generate chunks, embed them, and save to LanceDB', async () => {
    // Mock the file traversal to find two mock files
    vi.mocked(glob).mockResolvedValue(['src/mock1.ts', 'src/mock2.ts']);
    
    // Mock the file contents to be short enough to avoid excessive chunking
    vi.mocked(fs.readFile).mockResolvedValue('const a = 1;');

    await indexCodebase();

    expect(glob).toHaveBeenCalledWith('**/*.{ts,tsx,md}', expect.any(Object));
    expect(fs.readFile).toHaveBeenCalledTimes(2);
    expect(fs.readFile).toHaveBeenCalledWith('src/mock1.ts', 'utf-8');
  });

  it('should exit early if no files are found', async () => {
    vi.mocked(glob).mockResolvedValue([]);

    await indexCodebase();

    expect(glob).toHaveBeenCalled();
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
