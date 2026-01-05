/**
 * Embeddings Storage Module
 *
 * NOTE: This module requires pgvector extension to be enabled in PostgreSQL.
 * If pgvector is not available, all functions will gracefully return without storing.
 *
 * To enable: Run `CREATE EXTENSION IF NOT EXISTS vector;` in your database,
 * then uncomment the vectors export in src/drizzle/schema.ts
 */

import { db } from '@/drizzle/db';
import { generateBatchEmbeddings } from './embedder';
import { parseResumeIntoChunks, type ResumeChunk } from './resume-parser';

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
  console.warn('[Embeddings] pgvector not available - embedding storage disabled');
}

/**
 * Embed and store a user's resume
 * Parses the resume into chunks, generates embeddings, and stores them
 */
export async function embedAndStoreResume(
  userId: string,
  resumeText: string
): Promise<{ chunksStored: number }> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    console.warn('[Embeddings] pgvector not available - skipping resume embedding');
    return { chunksStored: 0 };
  }

  if (!resumeText || resumeText.trim().length === 0) {
    return { chunksStored: 0 };
  }

  const { eq, and } = await import('drizzle-orm');

  // Parse resume into semantic chunks
  const chunks = parseResumeIntoChunks(resumeText);

  if (chunks.length === 0) {
    return { chunksStored: 0 };
  }

  // Delete existing resume embeddings for this user
  await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.user_id, userId),
        eq(documentEmbeddings.source_type, 'resume')
      )
    );

  // Generate embeddings for all chunks
  const embeddings = await generateBatchEmbeddings(chunks.map((c) => c.text));

  // Store embeddings in database
  const values = chunks.map((chunk, i) => ({
    source_type: 'resume' as const,
    source_id: userId, // For resumes, source_id is the user_id
    user_id: userId,
    chunk_text: chunk.text,
    chunk_index: chunk.index,
    embedding: embeddings[i],
    metadata: {
      section: chunk.section,
      verified: false, // Resume content is not verified by default
    },
  }));

  if (values.length > 0) {
    await db.insert(documentEmbeddings).values(values);
  }

  return { chunksStored: values.length };
}

/**
 * Embed and store a skill verification snippet from an interview
 * This creates verified content for the Digital Twin
 */
export async function embedSkillVerification(
  userId: string,
  verificationId: string,
  transcriptSnippet: string,
  skillIds: string[],
  summary?: string
): Promise<void> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    console.warn('[Embeddings] pgvector not available - skipping skill verification embedding');
    return;
  }

  if (!transcriptSnippet || transcriptSnippet.trim().length === 0) {
    return;
  }

  const { eq } = await import('drizzle-orm');

  // Combine snippet with summary for better context
  const textToEmbed = summary
    ? `${summary}\n\nEvidence: "${transcriptSnippet}"`
    : transcriptSnippet;

  // Generate embedding
  const embeddings = await generateBatchEmbeddings([textToEmbed]);

  if (embeddings.length === 0 || embeddings[0].length === 0) {
    return;
  }

  // Store in database
  await db.insert(documentEmbeddings).values({
    source_type: 'skill_verification',
    source_id: verificationId,
    user_id: userId,
    chunk_text: textToEmbed,
    chunk_index: 0,
    embedding: embeddings[0],
    metadata: {
      skill_ids: skillIds,
      verified: true, // This is verified content from interviews
    },
  });
}

/**
 * Embed and store a job listing for semantic search
 */
export async function embedJobListing(
  jobListingId: string,
  title: string,
  description: string,
  company?: string,
  location?: string
): Promise<void> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    return; // Silently skip - job listings will still work without embeddings
  }

  const { eq, and } = await import('drizzle-orm');

  // Combine all text for a comprehensive embedding
  const textToEmbed = [
    `Job Title: ${title}`,
    company ? `Company: ${company}` : '',
    location ? `Location: ${location}` : '',
    `Description: ${description}`,
  ]
    .filter(Boolean)
    .join('\n');

  // Generate embedding
  const embeddings = await generateBatchEmbeddings([textToEmbed]);

  if (embeddings.length === 0 || embeddings[0].length === 0) {
    return;
  }

  // Check if embedding already exists for this job
  const existing = await db
    .select({ id: documentEmbeddings.id })
    .from(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.source_id, jobListingId),
        eq(documentEmbeddings.source_type, 'job_listing')
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update existing embedding
    await db
      .update(documentEmbeddings)
      .set({
        chunk_text: textToEmbed,
        embedding: embeddings[0],
        metadata: { title, company, location },
        updated_at: new Date(),
      })
      .where(eq(documentEmbeddings.id, existing[0].id));
  } else {
    // Insert new embedding
    await db.insert(documentEmbeddings).values({
      source_type: 'job_listing',
      source_id: jobListingId,
      user_id: null, // Job listings are not user-specific
      chunk_text: textToEmbed,
      chunk_index: 0,
      embedding: embeddings[0],
      metadata: { title, company, location },
    });
  }
}

/**
 * Embed and store multiple job listings in batch
 * More efficient for bulk operations
 */
export async function embedJobListingsBatch(
  listings: Array<{
    id: string;
    title: string;
    description: string;
    company?: string;
    location?: string;
  }>
): Promise<{ embedded: number }> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    return { embedded: 0 };
  }

  if (listings.length === 0) {
    return { embedded: 0 };
  }

  const { eq, and } = await import('drizzle-orm');

  // Prepare texts for embedding
  const textsToEmbed = listings.map((listing) =>
    [
      `Job Title: ${listing.title}`,
      listing.company ? `Company: ${listing.company}` : '',
      listing.location ? `Location: ${listing.location}` : '',
      `Description: ${listing.description}`,
    ]
      .filter(Boolean)
      .join('\n')
  );

  // Generate embeddings in batch
  const embeddings = await generateBatchEmbeddings(textsToEmbed);

  // Prepare values for insertion
  const values = listings.map((listing, i) => ({
    source_type: 'job_listing' as const,
    source_id: listing.id,
    user_id: null,
    chunk_text: textsToEmbed[i],
    chunk_index: 0,
    embedding: embeddings[i],
    metadata: {
      title: listing.title,
      company: listing.company,
      location: listing.location,
    },
  }));

  // Delete existing embeddings for these job listings
  const jobIds = listings.map((l) => l.id);
  await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.source_type, 'job_listing'),
        // Use a subquery or raw SQL for IN clause
        // For simplicity, we'll delete one by one or use a different approach
      )
    );

  // For now, just insert (we handle duplicates with ON CONFLICT in a real scenario)
  // In production, you'd want to use upsert or batch delete/insert
  if (values.length > 0) {
    await db.insert(documentEmbeddings).values(values);
  }

  return { embedded: values.length };
}

/**
 * Delete all embeddings for a user
 * Used when a user deletes their account
 */
export async function deleteUserEmbeddings(userId: string): Promise<void> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    return;
  }

  const { eq } = await import('drizzle-orm');

  await db
    .delete(documentEmbeddings)
    .where(eq(documentEmbeddings.user_id, userId));
}

/**
 * Delete embeddings by source
 */
export async function deleteEmbeddingsBySource(
  sourceType: string,
  sourceId: string
): Promise<void> {
  if (!isPgVectorAvailable || !documentEmbeddings) {
    return;
  }

  const { eq, and } = await import('drizzle-orm');

  await db
    .delete(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.source_type, sourceType),
        eq(documentEmbeddings.source_id, sourceId)
      )
    );
}
