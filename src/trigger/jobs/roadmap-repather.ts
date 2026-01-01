/**
 * Roadmap Repather Job
 *
 * Triggered when: ROADMAP_REPATH_NEEDED event is published
 * Purpose: Re-generate roadmap modules based on new feedback
 *
 * Reasons for re-pathing:
 * - skill_verification_gaps: Interview revealed skill gaps
 * - market_shift: Market demand changed significantly
 * - rejection_feedback: Multiple rejections cited same skill gaps
 * - user_request: User manually requested new roadmap
 * - interview_performance: Poor interview performance patterns
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

interface RoadmapRepatherPayload {
  event_id: string;
  user_id: string;
  reason:
    | 'skill_verification_gaps'
    | 'market_shift'
    | 'rejection_feedback'
    | 'user_request'
    | 'interview_performance';
  details: Record<string, unknown>;
}

export const roadmapRepather = task({
  id: 'architect.repath-roadmap',
  run: async (payload: RoadmapRepatherPayload) => {
    const { event_id, user_id, reason, details } = payload;

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
      // TODO: Implement in Phase 5.5
      // =========================================================================

      console.log('='.repeat(60));
      console.log('[Roadmap Repather] Job triggered');
      console.log(`  User ID: ${user_id}`);
      console.log(`  Reason: ${reason}`);
      console.log(`  Details:`, JSON.stringify(details, null, 2));
      console.log('='.repeat(60));

      // Step 1: Fetch current roadmap
      // const currentRoadmap = await db.query.roadmaps.findFirst({
      //   where: and(
      //     eq(roadmaps.user_id, user_id),
      //     eq(roadmaps.status, 'active')
      //   ),
      //   with: { modules: true },
      // });

      // Step 2: Fetch user's verified vs claimed skills
      // const skills = await db.query.userSkills.findMany({
      //   where: eq(userSkills.user_id, user_id),
      //   with: { skill: true, verifications: true },
      // });

      // Step 3: Fetch latest market insights
      // const userProfile = await db.query.userProfiles.findFirst({
      //   where: eq(userProfiles.user_id, user_id),
      // });
      // const marketData = await getMarketDataForRoles(userProfile.target_roles);

      // Step 4: Determine what needs to change based on reason
      // let adjustments: RoadmapAdjustment[];
      // switch (reason) {
      //   case 'skill_verification_gaps':
      //     adjustments = prioritizeUnverifiedSkills(skills, details.gaps);
      //     break;
      //   case 'market_shift':
      //     adjustments = addTrendingSkillModules(marketData);
      //     break;
      //   case 'rejection_feedback':
      //     adjustments = addressRejectionGaps(details.gaps);
      //     break;
      // }

      // Step 5: Re-generate roadmap modules (AI)
      // const newModules = await regenerateModules(currentRoadmap, adjustments);

      // Step 6: Update roadmap in DB
      // await db.update(roadmaps).set({
      //   updated_at: new Date(),
      //   repath_count: sql`repath_count + 1`,
      //   last_repath_reason: reason,
      // }).where(eq(roadmaps.id, currentRoadmap.id));

      // Mark event as completed
      await markEventCompleted(event_id);

      return {
        success: true,
        repathed: false, // Will be true when implemented
        user_id,
        reason,
      };
    } catch (error) {
      console.error('[Roadmap Repather] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  },
});
