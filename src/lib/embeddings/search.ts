/**
 * Embeddings Search Module
 *
 * NOTE: This module requires pgvector extension to be enabled in PostgreSQL.
 * If pgvector is not available, all search functions will return empty results.
 *
 * To enable: Run `CREATE EXTENSION IF NOT EXISTS vector;` in your database,
 * then uncomment the vectors export in src/drizzle/schema.ts
 */

import { db } from '@/drizzle/db';
import { generateEmbedding } from './embedder';

// Check if pgvector/documentEmbeddings is available
let documentEmbeddings: any = null;
let isPgVectorAvailable = false;

try {
  // Dynamic import to avoid build errors when vectors schema is commented out
  const schema = require('@/drizzle/schema');
  if (schema.documentEmbeddings) {
    documentEmbeddings = schema.documentEmbeddings;
    isPgVectorAvailable = true;
  }
} catch {
  console.warn('[Embeddings] pgvector not available - semantic search disabled');
}

export interface SearchOptions {
  /** Filter by source types (e.g., 'resume', 'skill_verification', 'job_listing') */
  sourceTypes?: string[];
  /** Filter by user ID for user-specific content */
  userId?: string;
  /** Only return verified content (for Digital Twin) */
  onlyVerified?: boolean;
  /** Maximum number of results to return */
  topK?: number;
  /** Minimum similarity score threshold (0-1) */
  minSimilarity?: number;
}

export interface SearchResult {
  text: string;
  score: number;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown> | null;
}

/**
 * Search for similar documents using cosine similarity
 * Returns documents ordered by similarity score (descending)
 */
export async function searchSimilarDocuments(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    console.warn('[Embeddings] pgvector not available - returning empty results');
    return [];
  }

  const {
    sourceTypes,
    userId,
    onlyVerified = false,
    topK = 5,
    minSimilarity = 0.3,
  } = options;

  const { sql, and, eq } = await import('drizzle-orm');
  const { cosineDistance, desc, gt } = await import('drizzle-orm');

  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Calculate similarity score (1 - cosine distance)
  const similarity = sql<number>`1 - (${cosineDistance(documentEmbeddings.embedding, queryEmbedding)})`;

  // Build WHERE conditions dynamically
  const conditions = [];

  if (sourceTypes && sourceTypes.length > 0) {
    conditions.push(
      sql`${documentEmbeddings.source_type} = ANY(${sql.raw(`ARRAY[${sourceTypes.map((t) => `'${t}'`).join(',')}]::varchar[]`)})`
    );
  }

  if (userId) {
    conditions.push(eq(documentEmbeddings.user_id, userId));
  }

  if (onlyVerified) {
    conditions.push(
      sql`(${documentEmbeddings.metadata}->>'verified')::boolean = true`
    );
  }

  // Add minimum similarity threshold
  conditions.push(gt(similarity, minSimilarity));

  // Execute the query
  const results = await db
    .select({
      text: documentEmbeddings.chunk_text,
      score: similarity,
      sourceType: documentEmbeddings.source_type,
      sourceId: documentEmbeddings.source_id,
      metadata: documentEmbeddings.metadata,
    })
    .from(documentEmbeddings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(similarity))
    .limit(topK);

  return results;
}

/**
 * Search for verified content only (for Digital Twin RAG)
 * Only retrieves content from skill verifications and resumes that are marked as verified
 */
export async function searchVerifiedContent(
  userId: string,
  query: string,
  topK = 5
): Promise<Array<{ text: string; score: number }>> {
  const results = await searchSimilarDocuments(query, {
    userId,
    sourceTypes: ['skill_verification', 'resume'],
    onlyVerified: true,
    topK,
    minSimilarity: 0.3,
  });

  return results.map((r) => ({
    text: r.text,
    score: r.score,
  }));
}

/**
 * Search for job listings similar to a user's profile
 * Used for job matching in the Sentinel Agent
 */
export async function searchSimilarJobs(
  query: string,
  topK = 10
): Promise<SearchResult[]> {
  return searchSimilarDocuments(query, {
    sourceTypes: ['job_listing'],
    topK,
    minSimilarity: 0.4, // Higher threshold for job matching
  });
}

/**
 * Search for similar resumes (for recruiter search)
 * Only searches public resumes
 */
export async function searchSimilarResumes(
  query: string,
  topK = 10
): Promise<SearchResult[]> {
  return searchSimilarDocuments(query, {
    sourceTypes: ['resume'],
    topK,
    minSimilarity: 0.35,
  });
}

/**
 * Get context for a specific user's profile
 * Retrieves all relevant embeddings for RAG context
 */
export async function getUserContext(
  userId: string,
  query: string,
  topK = 10
): Promise<SearchResult[]> {
  return searchSimilarDocuments(query, {
    userId,
    sourceTypes: ['resume', 'skill_verification'],
    topK,
    minSimilarity: 0.25,
  });
}
