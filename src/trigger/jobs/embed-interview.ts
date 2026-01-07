/**
 * Interview Embedding Job
 *
 * Triggered when: INTERVIEW_COMPLETED event is published (after interview-analyzer)
 * Purpose: Embed interview transcripts for RAG-based context retrieval
 *
 * This job:
 * 1. Fetches interview transcript from interviews table
 * 2. Chunks the conversation into semantic sections
 * 3. Generates embeddings via OpenAI text-embedding-3-small
 * 4. Stores in document_embeddings table with pgvector
 *
 * The embeddings enable:
 * - Retrieval of relevant past interview responses during new interviews
 * - Context-aware skill verification across multiple interviews
 * - Better understanding of user growth over time
 * - Personalized coaching recommendations
 */

import { task } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import { interviews } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import { embedInterviewTranscript } from '@/services/embeddings';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  markEventProcessing,
} from '@/lib/agents/message-bus';

interface EmbedInterviewPayload {
  event_id: string;
  interview_id: string;
  user_id: string;
  interview_type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive' | 'mock_interview';
  duration_minutes?: number;
}

export const embedInterviewJob = task({
  id: 'action.embed-interview',
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
  },
  run: async (payload: EmbedInterviewPayload) => {
    const { event_id, interview_id, user_id, interview_type, duration_minutes } = payload;

    // =========================================================================
    // IDEMPOTENCY CHECK
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      console.log(`[Embed Interview] Skipping event ${event_id}: ${idempotencyCheck.reason}`);
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    await markEventProcessing(event_id);

    try {
      console.log('='.repeat(60));
      console.log('[Embed Interview] Starting interview embedding');
      console.log(`  Interview ID: ${interview_id}`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Type: ${interview_type}`);
      console.log('='.repeat(60));

      // =========================================================================
      // Step 1: Fetch interview transcript from DB
      // =========================================================================
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.id, interview_id),
      });

      if (!interview) {
        throw new Error(`Interview ${interview_id} not found`);
      }

      // Extract transcript from raw_data
      const rawTranscript = interview.raw_data?.transcript;
      if (!rawTranscript || !Array.isArray(rawTranscript)) {
        console.log('[Embed Interview] No valid transcript found, skipping embedding');
        await markEventCompleted(event_id);
        return {
          success: true,
          skipped: true,
          reason: 'no_transcript',
        };
      }

      // Format transcript into a single text block
      const typedTranscript = rawTranscript as Array<{
        speaker?: 'user' | 'agent';
        text?: string;
        timestamp?: string;
      }>;

      const formattedTranscript = typedTranscript
        .filter(t => t && typeof t.text === 'string')
        .map((t) => {
          const speaker = t.speaker === 'user' ? 'Candidate' : 'Interviewer';
          return `[${speaker}]: ${t.text}`;
        })
        .join('\n\n');

      if (!formattedTranscript || formattedTranscript.length < 100) {
        console.log('[Embed Interview] Transcript too short, skipping embedding');
        await markEventCompleted(event_id);
        return {
          success: true,
          skipped: true,
          reason: 'transcript_too_short',
        };
      }

      console.log(`[Embed Interview] Transcript length: ${formattedTranscript.length} chars`);

      // =========================================================================
      // Step 2: Extract skills discussed from interview analysis
      // =========================================================================
      const analysis = interview.raw_data?.analysis as {
        skills_assessed?: Array<{ skill_name: string }>;
      } | undefined;

      const skillsDiscussed = analysis?.skills_assessed?.map(s => s.skill_name) || [];

      // =========================================================================
      // Step 3: Embed the interview transcript
      // =========================================================================
      // Map interview types
      const mappedType: 'reality_check' | 'weekly_sprint' | 'mock_interview' =
        interview_type === 'skill_deep_dive' ? 'mock_interview' : interview_type;

      const result = await embedInterviewTranscript(
        interview_id,
        user_id,
        formattedTranscript,
        {
          interviewType: mappedType,
          skillsDiscussed,
          duration: duration_minutes,
        }
      );

      console.log('[Embed Interview] Embedding complete:');
      console.log(`  Chunks: ${result.chunkCount}`);
      console.log(`  Vectors: ${result.vectorIds.length}`);
      console.log(`  Model: ${result.embeddingModel}`);
      console.log(`  Skills embedded: ${result.skillsEmbedded.join(', ') || 'none'}`);

      // Mark event as completed
      await markEventCompleted(event_id);

      console.log('='.repeat(60));
      console.log('[Embed Interview] Job complete!');
      console.log('='.repeat(60));

      return {
        success: true,
        interview_id,
        user_id,
        interview_type,
        chunk_count: result.chunkCount,
        vector_count: result.vectorIds.length,
        embedding_model: result.embeddingModel,
        skills_embedded: result.skillsEmbedded,
      };
    } catch (error) {
      console.error('[Embed Interview] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Batch Re-Embed Interviews Job
 *
 * Triggered manually to re-embed all interviews for a user
 * Useful when embedding model changes or to backfill historical data
 */
export const reEmbedInterviewsJob = task({
  id: 'action.re-embed-interviews',
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 60000,
  },
  run: async (payload: { user_id: string; limit?: number }) => {
    const { user_id, limit = 50 } = payload;

    console.log(`[Re-Embed Interviews] Starting batch re-embed for user ${user_id}`);

    // Fetch all user's interviews with transcripts
    const userInterviews = await db.query.interviews.findMany({
      where: eq(interviews.user_id, user_id),
      orderBy: (interviews, { desc }) => [desc(interviews.created_at)],
      limit,
    });

    console.log(`[Re-Embed Interviews] Found ${userInterviews.length} interviews`);

    let embedded = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const interview of userInterviews) {
      try {
        const rawTranscript = interview.raw_data?.transcript;
        if (!rawTranscript || !Array.isArray(rawTranscript)) {
          skipped++;
          continue;
        }

        const typedTranscript = rawTranscript as Array<{
          speaker?: 'user' | 'agent';
          text?: string;
        }>;

        const formattedTranscript = typedTranscript
          .filter(t => t && typeof t.text === 'string')
          .map((t) => `[${t.speaker === 'user' ? 'Candidate' : 'Interviewer'}]: ${t.text}`)
          .join('\n\n');

        if (formattedTranscript.length < 100) {
          skipped++;
          continue;
        }

        const analysis = interview.raw_data?.analysis as {
          skills_assessed?: Array<{ skill_name: string }>;
        } | undefined;

        const skillsDiscussed = analysis?.skills_assessed?.map(s => s.skill_name) || [];

        // Determine interview type from the interview.type column
        // Map the enum values to our expected types
        const rawType = interview.type;
        const interviewType: 'reality_check' | 'weekly_sprint' | 'mock_interview' =
          rawType === 'reality_check' ? 'reality_check' :
          rawType === 'weekly_sprint' ? 'weekly_sprint' : 'mock_interview';

        await embedInterviewTranscript(
          interview.id,
          user_id,
          formattedTranscript,
          {
            interviewType,
            skillsDiscussed,
          }
        );

        embedded++;
        console.log(`[Re-Embed Interviews] Embedded interview ${interview.id}`);
      } catch (error) {
        const errorMsg = `Interview ${interview.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`[Re-Embed Interviews] Error:`, errorMsg);
      }
    }

    console.log(`[Re-Embed Interviews] Complete:`);
    console.log(`  Embedded: ${embedded}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Errors: ${errors.length}`);

    return {
      success: errors.length === 0,
      user_id,
      total_interviews: userInterviews.length,
      embedded,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
