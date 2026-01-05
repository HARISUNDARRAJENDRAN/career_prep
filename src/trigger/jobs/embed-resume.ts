/**
 * Resume Embedding Job
 *
 * Triggered when: RESUME_UPLOADED event is published
 * Purpose: Embed resume content for RAG-based job matching and cover letter generation
 *
 * This job:
 * 1. Fetches resume text from user_profiles
 * 2. Chunks text into semantic sections
 * 3. Generates embeddings via OpenAI text-embedding-3-small
 * 4. Stores in document_embeddings table with pgvector
 * 5. Updates user_profiles with embedding metadata
 *
 * The embeddings enable:
 * - Semantic job matching beyond keyword matching
 * - RAG-powered personalized cover letters
 * - Better skill gap analysis
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { userProfiles } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { embedResume } from '@/services/embeddings';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  markEventProcessing,
} from '@/lib/agents/message-bus';

interface EmbedResumePayload {
  event_id: string;
  user_id: string;
  // Optional: pass resume text directly to avoid re-fetching
  resume_text?: string;
}

export const embedResumeJob = task({
  id: 'action.embed-resume',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: EmbedResumePayload) => {
    const { event_id, user_id, resume_text: providedResumeText } = payload;

    // =========================================================================
    // IDEMPOTENCY CHECK
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      console.log(`[Embed Resume] Skipping event ${event_id}: ${idempotencyCheck.reason}`);
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    await markEventProcessing(event_id);

    try {
      console.log('='.repeat(60));
      console.log('[Embed Resume] Starting resume embedding');
      console.log(`  User ID: ${user_id}`);
      console.log('='.repeat(60));

      // =========================================================================
      // Step 1: Get resume text
      // =========================================================================
      let resumeText = providedResumeText;

      if (!resumeText) {
        const userProfile = await db.query.userProfiles.findFirst({
          where: eq(userProfiles.user_id, user_id),
        });

        if (!userProfile) {
          throw new Error(`User profile not found for ${user_id}`);
        }

        resumeText = userProfile.resume_text || '';

        if (!resumeText) {
          console.log('[Embed Resume] No resume text found, skipping embedding');
          await markEventCompleted(event_id);
          return {
            success: true,
            skipped: true,
            reason: 'no_resume_text',
          };
        }
      }

      console.log(`[Embed Resume] Resume text length: ${resumeText.length} chars`);

      // =========================================================================
      // Step 2: Embed the resume
      // =========================================================================
      const result = await embedResume(user_id, resumeText);

      console.log('[Embed Resume] Embedding complete:');
      console.log(`  Chunks: ${result.chunkCount}`);
      console.log(`  Vectors: ${result.vectorIds.length}`);
      console.log(`  Model: ${result.embeddingModel}`);
      console.log(`  Hash: ${result.syncHash}`);

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('='.repeat(60));
      console.log('[Embed Resume] Job complete!');
      console.log('='.repeat(60));

      return {
        success: true,
        user_id,
        chunk_count: result.chunkCount,
        vector_count: result.vectorIds.length,
        embedding_model: result.embeddingModel,
        sync_hash: result.syncHash,
      };
    } catch (error) {
      console.error('[Embed Resume] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Re-embed Resume Job
 *
 * Triggered when: Resume is updated or needs re-processing
 * This is a wrapper that forces re-embedding even if hash matches
 */
export const reEmbedResumeJob = task({
  id: 'action.re-embed-resume',
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: { user_id: string }) => {
    const { user_id } = payload;

    console.log(`[Re-Embed Resume] Forcing re-embedding for user ${user_id}`);

    // Clear existing metadata to force re-embedding
    await db
      .update(userProfiles)
      .set({
        resume_is_embedded: false,
        resume_vector_metadata: null,
        updated_at: new Date(),
      })
      .where(eq(userProfiles.user_id, user_id));

    // Fetch resume text
    const userProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, user_id),
    });

    if (!userProfile?.resume_text) {
      return {
        success: false,
        reason: 'no_resume_text',
      };
    }

    // Embed resume
    const result = await embedResume(user_id, userProfile.resume_text);

    return {
      success: true,
      user_id,
      chunk_count: result.chunkCount,
      vector_count: result.vectorIds.length,
    };
  },
});
