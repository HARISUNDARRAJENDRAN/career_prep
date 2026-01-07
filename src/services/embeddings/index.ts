
/**
 * Embedding Service
 *
 * Handles vector embedding generation using OpenAI text-embedding-3-small
 * and storage/retrieval in pgvector via Drizzle ORM.
 *
 * Features:
 * - Generate embeddings for text chunks
 * - Store embeddings in PostgreSQL with pgvector
 * - Semantic similarity search using cosine distance
 * - Resume and job listing embedding pipelines
 */

import OpenAI from 'openai';
import { db } from '@/drizzle/db';
import { documentEmbeddings, userProfiles } from '@/drizzle/schema';
import { eq, sql, and } from 'drizzle-orm';
import {
  chunkResume,
  chunkText,
  generateContentHash,
  batchChunks,
} from './chunker';
import type {
  TextChunk,
  SimilaritySearchResult,
  SearchOptions,
  ResumeEmbeddingResult,
  JobEmbeddingResult,
  InterviewEmbeddingResult,
} from './types';

// Configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_BATCH_SIZE = 100;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.trim(),
  });

  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Filter out empty texts
  const validTexts = texts.filter((t) => t && t.trim().length > 0);
  if (validTexts.length === 0) {
    return [];
  }

  // Split into batches if needed
  const batches = batchChunks(validTexts, MAX_BATCH_SIZE);
  const allEmbeddings: number[][] = [];

  for (const batch of batches) {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch.map((t) => t.trim()),
    });

    // Ensure embeddings are in same order as input
    const sortedEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    allEmbeddings.push(...sortedEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Embed and store a user's resume
 *
 * This will:
 * 1. Delete existing resume embeddings for the user
 * 2. Chunk the resume into semantic sections
 * 3. Generate embeddings for each chunk
 * 4. Store in document_embeddings table
 * 5. Update user_profiles with metadata
 */
export async function embedResume(
  userId: string,
  resumeText: string
): Promise<ResumeEmbeddingResult> {
  console.log(`[Embedding Service] Embedding resume for user ${userId}`);

  // Generate content hash to detect changes
  const syncHash = generateContentHash(resumeText);

  // Check if resume is already embedded with same content
  const existingProfile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.user_id, userId),
  });

  if (existingProfile?.resume_vector_metadata?.last_sync_hash === syncHash) {
    console.log('[Embedding Service] Resume already embedded, skipping');
    return {
      chunkCount: existingProfile.resume_vector_metadata.chunk_count || 0,
      vectorIds: existingProfile.resume_vector_metadata.vector_ids || [],
      embeddingModel: EMBEDDING_MODEL,
      syncHash,
    };
  }

  // Delete existing embeddings for this user's resume
  await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.user_id, userId),
        eq(documentEmbeddings.source_type, 'resume')
      )
    );

  console.log('[Embedding Service] Deleted old resume embeddings');

  // Chunk the resume
  const chunks = chunkResume(resumeText);
  console.log(`[Embedding Service] Created ${chunks.length} chunks`);

  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      vectorIds: [],
      embeddingModel: EMBEDDING_MODEL,
      syncHash,
    };
  }

  // Generate embeddings in batch
  const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.text));
  console.log(`[Embedding Service] Generated ${embeddings.length} embeddings`);

  // Create source ID for this resume version
  const sourceId = `resume-${userId}-${Date.now()}`;

  // Store embeddings
  const vectorIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    const [inserted] = await db
      .insert(documentEmbeddings)
      .values({
        source_type: 'resume',
        source_id: sourceId,
        user_id: userId,
        chunk_text: chunk.text,
        chunk_index: chunk.index,
        embedding: embedding,
        metadata: {
          section: chunk.section,
          verified: false,
        },
      })
      .returning({ id: documentEmbeddings.id });

    vectorIds.push(inserted.id);
  }

  console.log(`[Embedding Service] Stored ${vectorIds.length} embeddings`);

  // Update user profile with embedding metadata
  await db
    .update(userProfiles)
    .set({
      resume_is_embedded: true,
      resume_embedded_at: new Date(),
      resume_vector_metadata: {
        chunk_count: chunks.length,
        embedding_model: EMBEDDING_MODEL,
        vector_ids: vectorIds,
        last_sync_hash: syncHash,
      },
      updated_at: new Date(),
    })
    .where(eq(userProfiles.user_id, userId));

  console.log('[Embedding Service] Updated user profile metadata');

  return {
    chunkCount: chunks.length,
    vectorIds,
    embeddingModel: EMBEDDING_MODEL,
    syncHash,
  };
}

/**
 * Embed and store a job listing
 */
export async function embedJobListing(
  jobId: string,
  description: string,
  metadata?: {
    title?: string;
    company?: string;
    location?: string;
  }
): Promise<JobEmbeddingResult> {
  console.log(`[Embedding Service] Embedding job listing ${jobId}`);

  // Check if already embedded
  const existing = await db.query.documentEmbeddings.findFirst({
    where: and(
      eq(documentEmbeddings.source_type, 'job_listing'),
      eq(documentEmbeddings.source_id, jobId)
    ),
  });

  if (existing) {
    console.log('[Embedding Service] Job already embedded');
    return {
      vectorId: existing.id,
      embeddingModel: EMBEDDING_MODEL,
    };
  }

  // Generate embedding for job description
  const embedding = await generateEmbedding(description);

  // Store embedding
  const [inserted] = await db
    .insert(documentEmbeddings)
    .values({
      source_type: 'job_listing',
      source_id: jobId,
      chunk_text: description,
      chunk_index: 0,
      embedding: embedding,
      metadata: {
        title: metadata?.title,
        company: metadata?.company,
        location: metadata?.location,
      },
    })
    .returning({ id: documentEmbeddings.id });

  console.log(`[Embedding Service] Stored job embedding: ${inserted.id}`);

  return {
    vectorId: inserted.id,
    embeddingModel: EMBEDDING_MODEL,
  };
}

/**
 * Search for similar documents using vector similarity
 *
 * Uses cosine distance with the HNSW index for fast lookup
 */
export async function searchSimilar(
  query: string | number[],
  options: SearchOptions = {}
): Promise<SimilaritySearchResult[]> {
  const {
    sourceType,
    userId,
    limit = 5,
    minSimilarity = 0.5,
  } = options;

  // Generate embedding if query is string
  const queryEmbedding = typeof query === 'string'
    ? await generateEmbedding(query)
    : query;

  // Build query with filters
  const conditions: ReturnType<typeof and>[] = [];

  if (sourceType) {
    conditions.push(eq(documentEmbeddings.source_type, sourceType));
  }

  if (userId) {
    conditions.push(eq(documentEmbeddings.user_id, userId));
  }

  // Convert embedding to PostgreSQL vector format
  const embeddingStr = JSON.stringify(queryEmbedding);

  // Execute similarity search
  const results = await db
    .select({
      id: documentEmbeddings.id,
      source_type: documentEmbeddings.source_type,
      source_id: documentEmbeddings.source_id,
      chunk_text: documentEmbeddings.chunk_text,
      metadata: documentEmbeddings.metadata,
      similarity: sql<number>`1 - (${documentEmbeddings.embedding} <=> ${embeddingStr}::vector)`,
    })
    .from(documentEmbeddings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${documentEmbeddings.embedding} <=> ${embeddingStr}::vector`)
    .limit(limit * 2); // Fetch extra to filter by similarity

  // Filter by minimum similarity and limit
  const filteredResults = results
    .filter((r) => r.similarity >= minSimilarity)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      chunkText: r.chunk_text,
      similarity: r.similarity,
      sourceType: r.source_type,
      sourceId: r.source_id,
      metadata: r.metadata as Record<string, unknown> | undefined,
    }));

  return filteredResults;
}

/**
 * Find most relevant resume sections for a job description
 *
 * Used by the cover letter generator to get context
 */
export async function findRelevantResumeContext(
  userId: string,
  jobDescription: string,
  limit: number = 5
): Promise<SimilaritySearchResult[]> {
  return searchSimilar(jobDescription, {
    sourceType: 'resume',
    userId,
    limit,
    minSimilarity: 0.4, // Lower threshold for broader context
  });
}

/**
 * Embed and store an interview transcript
 *
 * This will:
 * 1. Delete existing embeddings for this interview
 * 2. Chunk the transcript into semantic sections
 * 3. Generate embeddings for each chunk
 * 4. Store in document_embeddings table
 * 5. Return metadata about the embedding
 */
export async function embedInterviewTranscript(
  interviewId: string,
  userId: string,
  transcript: string,
  metadata?: {
    interviewType?: 'reality_check' | 'weekly_sprint' | 'mock_interview';
    skillsDiscussed?: string[];
    duration?: number;
  }
): Promise<InterviewEmbeddingResult> {
  console.log(`[Embedding Service] Embedding interview transcript ${interviewId}`);

  // Generate content hash to detect changes
  const syncHash = generateContentHash(transcript);

  // Check if interview is already embedded with same content
  const existing = await db.query.documentEmbeddings.findFirst({
    where: and(
      eq(documentEmbeddings.source_type, 'interview_transcript'),
      eq(documentEmbeddings.source_id, interviewId)
    ),
  });

  if (existing?.metadata && (existing.metadata as Record<string, unknown>).sync_hash === syncHash) {
    console.log('[Embedding Service] Interview already embedded, skipping');
    // Return existing data
    const existingEmbeddings = await db.query.documentEmbeddings.findMany({
      where: and(
        eq(documentEmbeddings.source_type, 'interview_transcript'),
        eq(documentEmbeddings.source_id, interviewId)
      ),
    });
    return {
      chunkCount: existingEmbeddings.length,
      vectorIds: existingEmbeddings.map((e) => e.id),
      embeddingModel: EMBEDDING_MODEL,
      interviewId,
      skillsEmbedded: metadata?.skillsDiscussed || [],
    };
  }

  // Delete existing embeddings for this interview
  await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.source_type, 'interview_transcript'),
        eq(documentEmbeddings.source_id, interviewId)
      )
    );

  console.log('[Embedding Service] Deleted old interview embeddings');

  // Chunk the transcript - use general text chunker with interview-specific settings
  const chunks = chunkText(transcript, {
    chunkSize: 1000, // Larger chunks for conversational context
    overlap: 150,    // More overlap to preserve conversation flow
  });
  console.log(`[Embedding Service] Created ${chunks.length} chunks from interview`);

  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      vectorIds: [],
      embeddingModel: EMBEDDING_MODEL,
      interviewId,
      skillsEmbedded: [],
    };
  }

  // Generate embeddings in batch
  const embeddings = await generateEmbeddingsBatch(chunks.map((c) => c.text));
  console.log(`[Embedding Service] Generated ${embeddings.length} embeddings`);

  // Store embeddings
  const vectorIds: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = embeddings[i];

    const [inserted] = await db
      .insert(documentEmbeddings)
      .values({
        source_type: 'interview_transcript',
        source_id: interviewId,
        user_id: userId,
        chunk_text: chunk.text,
        chunk_index: chunk.index,
        embedding: embedding,
        metadata: {
          interview_type: metadata?.interviewType,
          skills_discussed: metadata?.skillsDiscussed,
          duration: metadata?.duration,
          sync_hash: syncHash,
        },
      })
      .returning({ id: documentEmbeddings.id });

    vectorIds.push(inserted.id);
  }

  console.log(`[Embedding Service] Stored ${vectorIds.length} interview embeddings`);

  return {
    chunkCount: chunks.length,
    vectorIds,
    embeddingModel: EMBEDDING_MODEL,
    interviewId,
    skillsEmbedded: metadata?.skillsDiscussed || [],
  };
}

/**
 * Find relevant interview context for a query
 *
 * Used to retrieve past interview responses that are relevant to current questions
 */
export async function findRelevantInterviewContext(
  userId: string,
  query: string,
  limit: number = 3
): Promise<SimilaritySearchResult[]> {
  return searchSimilar(query, {
    sourceType: 'interview_transcript',
    userId,
    limit,
    minSimilarity: 0.45, // Slightly lower threshold for conversational content
  });
}

/**
 * Delete all embeddings for a user
 */
export async function deleteUserEmbeddings(userId: string): Promise<number> {
  const result = await db
    .delete(documentEmbeddings)
    .where(eq(documentEmbeddings.user_id, userId))
    .returning({ id: documentEmbeddings.id });

  return result.length;
}

/**
 * Delete embeddings for a specific source
 */
export async function deleteSourceEmbeddings(
  sourceType: string,
  sourceId: string
): Promise<number> {
  const result = await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.source_type, sourceType),
        eq(documentEmbeddings.source_id, sourceId)
      )
    )
    .returning({ id: documentEmbeddings.id });

  return result.length;
}

// Export types
export type { TextChunk, SimilaritySearchResult, SearchOptions, ResumeEmbeddingResult, JobEmbeddingResult, InterviewEmbeddingResult };
export { chunkText, chunkResume, generateContentHash } from './chunker';
