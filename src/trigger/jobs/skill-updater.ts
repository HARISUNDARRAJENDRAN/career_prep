/**
 * Skill Status Updater Job
 *
 * Triggered when: SKILL_VERIFIED event is published
 * Purpose: Update user's skill status and potentially trigger job matching
 *
 * When a skill is verified through an interview, this job:
 * 1. Updates the user_skills record with verification metadata
 * 2. Recalculates the user's overall skill profile
 * 3. Potentially triggers job matching for newly verified skills
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

interface SkillStatusPayload {
  event_id: string;
  user_id: string;
  skill_id: string;
  user_skill_id: string;
  confidence: number;
  verification_type: 'live_coding' | 'concept_explanation' | 'project_demo';
  transcript_snippet: string;
}

export const skillStatusUpdater = task({
  id: 'architect.update-skill-status',
  run: async (payload: SkillStatusPayload) => {
    const { event_id, user_id, skill_id, confidence, verification_type } =
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
      console.log('='.repeat(60));
      console.log('[Skill Status Updater] Job triggered');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Skill ID: ${skill_id}`);
      console.log(`  Confidence: ${(confidence * 100).toFixed(1)}%`);
      console.log(`  Verification Type: ${verification_type}`);
      console.log('='.repeat(60));

      // TODO: Implement skill status update logic
      // Step 1: Update user_skills.verification_metadata
      // Step 2: Recalculate proficiency level based on verification
      // Step 3: Check if this opens new job matching opportunities

      await markEventCompleted(event_id);

      return {
        success: true,
        updated: false, // Will be true when implemented
        user_id,
        skill_id,
        confidence,
      };
    } catch (error) {
      console.error('[Skill Status Updater] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});

/**
 * Market Repath Check Job
 *
 * Triggered when: MARKET_UPDATE event is published
 * Purpose: Check if market changes affect any user's roadmap
 *
 * When market data is updated, this job checks if any users need
 * their roadmaps re-evaluated based on:
 * - New trending skills in their target roles
 * - Declining demand for skills they're learning
 * - New job opportunities in their preferred locations
 */
export const marketRepathCheck = task({
  id: 'roadmap.repath.check',
  run: async (payload: {
    event_id: string;
    skills: string[];
    demand_scores: Record<string, number>;
    trending_roles: string[];
    region?: string;
    job_count: number;
  }) => {
    const { event_id, skills, trending_roles, job_count } = payload;

    // Idempotency check
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return { success: true, skipped: true, reason: idempotencyCheck.reason };
    }

    try {
      console.log('[Market Repath Check] Checking for affected users');
      console.log(`  Trending Skills: ${skills.slice(0, 5).join(', ')}...`);
      console.log(`  Trending Roles: ${trending_roles.join(', ')}`);
      console.log(`  Total Jobs: ${job_count}`);

      // TODO: Implement market repath check
      // Step 1: Find users with target_roles matching trending_roles
      // Step 2: Check if their roadmaps include declining skills
      // Step 3: Trigger ROADMAP_REPATH_NEEDED for affected users

      await markEventCompleted(event_id);

      return {
        success: true,
        users_affected: 0, // Will have actual count when implemented
      };
    } catch (error) {
      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw error;
    }
  },
});
