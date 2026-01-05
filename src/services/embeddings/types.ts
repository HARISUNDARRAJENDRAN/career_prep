/**
 * Embedding Service Types
 *
 * Type definitions for vector embedding operations.
 */

// Chunk of text with metadata for embedding
export interface TextChunk {
  text: string;
  index: number;
  section?: 'summary' | 'experience' | 'education' | 'skills' | 'projects' | 'certifications' | 'awards' | 'other';
  metadata?: Record<string, unknown>;
}

// Result from embedding generation
export interface EmbeddingResult {
  embedding: number[];
  tokenCount: number;
}

// Stored embedding with metadata
export interface StoredEmbedding {
  id: string;
  sourceType: 'resume' | 'job_listing' | 'skill_verification' | 'interview_transcript';
  sourceId: string;
  userId?: string;
  chunkText: string;
  chunkIndex: number;
  embedding: number[];
  metadata?: {
    section?: string;
    skillIds?: string[];
    verified?: boolean;
    title?: string;
    company?: string;
    location?: string;
  };
  createdAt: Date;
}

// Search result with similarity score
export interface SimilaritySearchResult {
  id: string;
  chunkText: string;
  similarity: number;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
}

// Options for similarity search
export interface SearchOptions {
  sourceType?: 'resume' | 'job_listing' | 'skill_verification' | 'interview_transcript';
  userId?: string;
  limit?: number;
  minSimilarity?: number;
}

// Resume embedding result
export interface ResumeEmbeddingResult {
  chunkCount: number;
  vectorIds: string[];
  embeddingModel: string;
  syncHash: string;
}

// Job listing embedding result
export interface JobEmbeddingResult {
  vectorId: string;
  embeddingModel: string;
}
