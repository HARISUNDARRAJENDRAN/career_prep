/**
 * Auto Applier Job
 *
 * Triggered when: JOB_MATCH_FOUND event is published
 * Purpose: Evaluate job match and optionally auto-apply
 *
 * This job is part of the Action Agent's autonomous job application system.
 * It evaluates whether a matched job is worth applying to and, if the user
 * has auto-apply enabled, automatically submits an application.
 *
 * Flow:
 * 1. Check if user has auto-apply enabled
 * 2. Fetch user's latest resume document
 * 3. Evaluate match quality (skills alignment)
 * 4. If auto-apply enabled and match score is high enough:
 *    a. Generate tailored cover letter using AI + RAG
 *    b. Submit application
 *    c. Create job_applications record
 *    d. Publish APPLICATION_SUBMITTED event
 *
 * NOTE: This file uses a local stub until Trigger.dev is installed.
 * Run `npx trigger.dev@latest init` to enable real background job execution.
 */

import { task } from '@trigger.dev/sdk';

import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';

interface AutoApplierPayload {
  event_id: string;
  user_id: string;
  job_listing_id: string;
  match_score: number;
  matching_skills: string[];
  missing_skills: string[];
}

export const autoApplier = task({
  id: 'action.evaluate-match',
  run: async (payload: AutoApplierPayload) => {
    const { event_id, user_id, job_listing_id, match_score } = payload;

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
      // TODO: Implement in Phase 7+ (needs Vector DB for RAG)
      // =========================================================================

      console.log('='.repeat(60));
      console.log('[Auto Applier] Job triggered');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Job Listing ID: ${job_listing_id}`);
      console.log(`  Match Score: ${match_score}%`);
      console.log(`  Matching Skills: ${payload.matching_skills.join(', ')}`);
      console.log(`  Missing Skills: ${payload.missing_skills.join(', ')}`);
      console.log('='.repeat(60));

      // Step 1: Check if user has auto-apply enabled
      // const userProfile = await db.query.userProfiles.findFirst({
      //   where: eq(userProfiles.user_id, user_id),
      // });
      //
      // if (!userProfile?.auto_apply_enabled) {
      //   console.log('[Auto Applier] Auto-apply not enabled for user');
      //   await markEventCompleted(event_id);
      //   return { success: true, applied: false, reason: 'auto_apply_disabled' };
      // }

      // Step 2: Check match score threshold
      // const MIN_AUTO_APPLY_SCORE = userProfile.auto_apply_threshold || 75;
      // if (match_score < MIN_AUTO_APPLY_SCORE) {
      //   console.log(`[Auto Applier] Score ${match_score} below threshold ${MIN_AUTO_APPLY_SCORE}`);
      //   await markEventCompleted(event_id);
      //   return { success: true, applied: false, reason: 'below_threshold' };
      // }

      // Step 3: Fetch user's latest resume document
      // const latestDocument = await db.query.applicationDocuments.findFirst({
      //   where: eq(applicationDocuments.user_id, user_id),
      //   orderBy: [desc(applicationDocuments.created_at)],
      // });

      // Step 4: Fetch job listing details
      // const jobListing = await db.query.jobListings.findFirst({
      //   where: eq(jobListings.id, job_listing_id),
      // });

      // Step 5: Generate tailored cover letter (AI + RAG)
      // const coverLetter = await generateCoverLetter(
      //   userProfile,
      //   jobListing,
      //   latestDocument
      // );

      // Step 6: Submit application (platform-specific)
      // const applicationResult = await submitApplication(
      //   jobListing,
      //   latestDocument,
      //   coverLetter
      // );

      // Step 7: Create job_applications record
      // const [application] = await db.insert(jobApplications).values({
      //   user_id,
      //   job_listing_id,
      //   document_id: latestDocument.id,
      //   status: 'applied',
      //   applied_at: new Date(),
      //   application_method: 'auto',
      // }).returning();

      // Step 8: Publish APPLICATION_SUBMITTED event
      // await publishAgentEvent({
      //   type: 'APPLICATION_SUBMITTED',
      //   payload: {
      //     application_id: application.id,
      //     user_id,
      //     job_listing_id,
      //     method: 'auto',
      //   },
      // });

      // Mark event as completed
      await markEventCompleted(event_id);

      return {
        success: true,
        applied: false, // Will be true when implemented
        user_id,
        job_listing_id,
        match_score,
      };
    } catch (error) {
      console.error('[Auto Applier] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Execute Apply Job
 *
 * Triggered when: AUTO_APPLY_TRIGGERED event is published
 * Purpose: Actually execute the application submission
 *
 * This is a separate job to allow for manual triggering and better tracking.
 */
export const executeApply = task({
  id: 'action.execute-apply',
  run: async (payload: {
    event_id: string;
    user_id: string;
    job_listing_id: string;
    document_id: string;
    confidence_score: number;
  }) => {
    const { event_id, user_id, job_listing_id } = payload;

    // Idempotency check
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    try {
      console.log('[Execute Apply] Executing application submission');
      console.log(`  User: ${user_id}, Job: ${job_listing_id}`);

      // TODO: Implement actual application submission logic

      await markEventCompleted(event_id);
      return { success: true, applied: false };
    } catch (error) {
      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
