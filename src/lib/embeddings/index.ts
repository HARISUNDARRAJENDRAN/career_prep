// Embeddings module - Vector database utilities for RAG
// Uses pgvector for semantic search capabilities

// Core embedding generation
export { generateEmbedding, generateBatchEmbeddings, cosineSimilarity, EMBEDDING_CONFIG } from './embedder';

// Semantic search functions
export {
  searchSimilarDocuments,
  searchVerifiedContent,
  searchSimilarJobs,
  searchSimilarResumes,
  getUserContext,
  type SearchOptions,
  type SearchResult,
} from './search';

// Resume parsing and chunking
export {
  parseResumeIntoChunks,
  extractSkillsList,
  getResumeStructure,
  type ResumeChunk,
  type ResumeSection,
} from './resume-parser';

// Storage functions
export {
  embedAndStoreResume,
  embedSkillVerification,
  embedJobListing,
  embedJobListingsBatch,
  deleteUserEmbeddings,
  deleteEmbeddingsBySource,
} from './store';
