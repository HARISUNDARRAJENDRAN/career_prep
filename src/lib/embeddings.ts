/**
 * Embeddings Library Re-export
 *
 * This file provides a convenient re-export of the embedding service
 * for use in server actions and other parts of the application.
 */

export {
  embedResume as embedAndStoreResume,
  embedResume,
  embedJobListing,
  generateEmbedding,
  generateEmbeddingsBatch,
  searchSimilar,
  findRelevantResumeContext,
  deleteUserEmbeddings,
  deleteSourceEmbeddings,
  chunkText,
  chunkResume,
  generateContentHash,
} from '@/services/embeddings';

export type {
  TextChunk,
  SimilaritySearchResult,
  SearchOptions,
  ResumeEmbeddingResult,
  JobEmbeddingResult,
} from '@/services/embeddings';
