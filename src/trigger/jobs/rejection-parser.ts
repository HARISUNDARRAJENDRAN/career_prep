/**
 * Rejection Parser Job
 *
 * Triggered when: REJECTION_PARSED event is published
 * Purpose: Process rejection feedback and trigger roadmap adjustments
 *
 * This job is part of the Strategist Agent's feedback loop. It analyzes
 * rejection reasons to identify patterns and recommend skill improvements.
 *
 * Flow:
 * 1. Analyze rejection reason (if provided)
 * 2. Identify skill gaps mentioned
 * 3. Update application_feedback record
 * 4. Trigger roadmap repath if significant gaps found
 *
 * NOTE: This file uses a local stub until Trigger.dev is installed.
 * Run `npx trigger.dev@latest init` to enable real background job execution.
 */

import { task } from '@trigger.dev/sdk';

import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  publishAgentEvent,
} from '@/lib/agents/message-bus';

interface RejectionParserPayload {
  event_id: string;
  application_id: string;
  user_id: string;
  gaps: string[];
  recommended_skills: string[];
  rejection_reason?: string;
}

export const rejectionParser = task({
  id: 'strategist.process-rejection',
  run: async (payload: RejectionParserPayload) => {
    const { event_id, application_id, user_id, gaps, recommended_skills } =
      payload;

    // =========================================================================
    // IDEMPOTENCY CHECK - Must be first!
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      console.log(`Skipping event ${event_id}: ${idempotencyCheck.reason}`);
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    try {
      // =========================================================================
      // TODO: Implement in Phase 6+
      // =========================================================================

      console.log('='.repeat(60));
      console.log('[Rejection Parser] Job triggered');
      console.log(`  Application ID: ${application_id}`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Gaps Identified: ${gaps.join(', ') || 'None'}`);
      console.log(
        `  Recommended Skills: ${recommended_skills.join(', ') || 'None'}`
      );
      console.log(`  Rejection Reason: ${payload.rejection_reason || 'N/A'}`);
      console.log('='.repeat(60));

      // Step 1: Update application_feedback record
      // await db.update(applicationFeedback).set({
      //   parsed_data: {
      //     gaps,
      //     recommended_skills,
      //     rejection_reason: payload.rejection_reason,
      //     parsed_at: new Date().toISOString(),
      //   },
      //   status: 'analyzed',
      // }).where(eq(applicationFeedback.job_application_id, application_id));

      // Step 2: Check if gaps warrant roadmap repath
      const REPATH_THRESHOLD = 2; // Trigger repath if 2+ gaps identified
      if (gaps.length >= REPATH_THRESHOLD) {
        console.log(
          `[Rejection Parser] ${gaps.length} gaps found, triggering roadmap repath`
        );

        await publishAgentEvent({
          type: 'ROADMAP_REPATH_NEEDED',
          payload: {
            user_id,
            reason: 'rejection_feedback',
            details: {
              application_id,
              gaps,
              recommended_skills,
              rejection_reason: payload.rejection_reason,
            },
          },
        });
      }

      // Mark event as completed
      await markEventCompleted(event_id);

      return {
        success: true,
        gaps_found: gaps.length,
        repath_triggered: gaps.length >= REPATH_THRESHOLD,
        user_id,
        application_id,
      };
    } catch (error) {
      console.error('[Rejection Parser] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Track Application Job
 *
 * Triggered when: APPLICATION_SUBMITTED event is published
 * Purpose: Track application for follow-up and analytics
 */
export const trackApplication = task({
  id: 'strategist.track-application',
  run: async (payload: {
    event_id: string;
    application_id: string;
    user_id: string;
    job_listing_id: string;
    method: 'auto' | 'manual';
  }) => {
    const { event_id, application_id, user_id, method } = payload;

    // Idempotency check
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    try {
      console.log('[Track Application] Tracking new application');
      console.log(`  Application: ${application_id}`);
      console.log(`  User: ${user_id}`);
      console.log(`  Method: ${method}`);

      // TODO: Implement tracking logic
      // - Schedule follow-up reminder (7 days, 14 days, 30 days)
      // - Update user's application velocity metrics
      // - Check for application patterns

      await markEventCompleted(event_id);
      return { success: true, tracked: true };
    } catch (error) {
      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
