/**
 * Interview Analyzer Job
 *
 * Triggered when: INTERVIEW_COMPLETED event is published
 * Purpose: Analyze interview transcript to verify claimed skills
 *
 * This job is part of the "Truth Loop" - it closes the feedback loop
 * between what users claim and what they demonstrate in interviews.
 *
 * Flow:
 * 1. Fetch interview transcript from DB
 * 2. Fetch user's claimed skills
 * 3. Use AI to analyze transcript for skill demonstrations
 * 4. Update user_skills with verification metadata
 * 5. Check for skill gaps
 * 6. Trigger roadmap repath if gaps found
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

interface InterviewAnalyzerPayload {
  event_id: string;
  interview_id: string;
  user_id: string;
  duration_minutes: number;
  interview_type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive';
}

export const interviewAnalyzer = task({
  id: 'interview.analyze',
  run: async (payload: InterviewAnalyzerPayload) => {
    const { event_id, interview_id, user_id } = payload;

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
      // TODO: Implement in Phase 5.5 (Truth Loop)
      // =========================================================================

      console.log('='.repeat(60));
      console.log('[Interview Analyzer] Job triggered');
      console.log(`  Interview ID: ${interview_id}`);
      console.log(`  User ID: ${user_id}`);
      console.log(`  Duration: ${payload.duration_minutes} minutes`);
      console.log(`  Type: ${payload.interview_type}`);
      console.log('='.repeat(60));

      // Step 1: Fetch interview transcript from DB
      // const interview = await db.query.interviews.findFirst({
      //   where: eq(interviews.id, interview_id),
      // });

      // Step 2: Fetch user's claimed skills
      // const claimedSkills = await db.query.userSkills.findMany({
      //   where: eq(userSkills.user_id, user_id),
      //   with: { skill: true },
      // });

      // Step 3: Analyze transcript for skill demonstrations (AI)
      // const verifiedSkills = await analyzeTranscriptForSkills(
      //   interview.raw_data.transcript,
      //   claimedSkills
      // );

      // Step 4: Update user_skills with verification metadata
      // for (const verified of verifiedSkills) {
      //   await db.update(userSkills).set({...}).where(...);
      // }

      // Step 5: Check for skill gaps
      // const gaps = findSkillGaps(claimedSkills, verifiedSkills);

      // Step 6: Trigger roadmap repath if gaps found
      // if (gaps.length > 0) {
      //   await publishAgentEvent({
      //     type: 'ROADMAP_REPATH_NEEDED',
      //     payload: {
      //       user_id,
      //       reason: 'skill_verification_gaps',
      //       details: { interview_id, gaps },
      //     },
      //   });
      // }

      // Mark event as completed
      await markEventCompleted(event_id);

      return {
        success: true,
        analyzed: true,
        interview_id,
        // verified_skills: verifiedSkills.length,
        // gaps_found: gaps.length,
      };
    } catch (error) {
      console.error('[Interview Analyzer] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error; // Re-throw for Trigger.dev retry logic
    }
  },
});
