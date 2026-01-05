import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/**
 * Generate embedding for a single text input
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call
 * OpenAI allows up to 2048 inputs per batch
 */
export async function generateBatchEmbeddings(
  texts: string[]
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Filter out empty texts and keep track of indices
  const validTexts: { index: number; text: string }[] = [];
  texts.forEach((text, index) => {
    if (text && text.trim().length > 0) {
      validTexts.push({ index, text: text.trim() });
    }
  });

  if (validTexts.length === 0) {
    return texts.map(() => []);
  }

  // OpenAI has a limit of 2048 inputs per batch
  const BATCH_SIZE = 2048;
  const allEmbeddings: Map<number, number[]> = new Map();

  for (let i = 0; i < validTexts.length; i += BATCH_SIZE) {
    const batch = validTexts.slice(i, i + BATCH_SIZE);
    const batchTexts = batch.map((item) => item.text);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batchTexts,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    // Map embeddings back to original indices
    response.data.forEach((embedding, batchIndex) => {
      const originalIndex = batch[batchIndex].index;
      allEmbeddings.set(originalIndex, embedding.embedding);
    });
  }

  // Return embeddings in original order, with empty arrays for filtered texts
  return texts.map((_, index) => allEmbeddings.get(index) || []);
}

/**
 * Calculate cosine similarity between two embeddings
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Export configuration for reference
export const EMBEDDING_CONFIG = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMENSIONS,
} as const;
