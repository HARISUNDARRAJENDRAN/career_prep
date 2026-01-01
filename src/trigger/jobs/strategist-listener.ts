/**
 * Strategist Global Listener
 *
 * This is a CRITICAL component of the Senior Engineer Refinement #3.
 *
 * The Strategist Agent subscribes to ALL events as a global listener.
 * This enables cross-cutting concerns and pattern detection across all agents.
 *
 * Purpose:
 * - Monitor user progress across all agents
 * - Detect patterns (e.g., "user failed 3 interviews in a row")
 * - Trigger interventions (e.g., "send encouragement", "suggest mentor")
 * - Maintain the "big picture" of user's career journey
 * - Track metrics for analytics and insights
 *
 * This job runs at LOW PRIORITY to avoid blocking primary event handlers.
 *
 * NOTE: This file uses a local stub until Trigger.dev is installed.
 * Run `npx trigger.dev@latest init` to enable real background job execution.
 */

import { task } from '@trigger.dev/sdk';

import { db } from '@/drizzle/db';
import {
  interviews,
  userSkills,
  jobApplications,
} from '@/drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  publishAgentEvent,
} from '@/lib/agents/message-bus';
import type { AgentEventType } from '@/lib/agents/events';

interface GlobalListenerPayload {
  event_id: string;
  event_type: AgentEventType;
  user_id: string;
}

export const strategistGlobalListener = task({
  id: 'strategist.global-listener',
  run: async (payload: GlobalListenerPayload) => {
    const { event_id, event_type, user_id } = payload;

    // =========================================================================
    // IDEMPOTENCY CHECK
    // =========================================================================
    const idempotencyCheck = await shouldSkipEvent(event_id);
    if (idempotencyCheck.skip) {
      return {
        success: true,
        skipped: true,
        reason: idempotencyCheck.reason,
      };
    }

    try {
      console.log('[Strategist Global Listener] Processing event');
      console.log(`  Event Type: ${event_type}`);
      console.log(`  User ID: ${user_id}`);

      // =========================================================================
      // Pattern Detection Based on Event Type
      // =========================================================================
      switch (event_type) {
        case 'INTERVIEW_COMPLETED':
          await checkInterviewPatterns(user_id);
          break;

        case 'REJECTION_PARSED':
          await checkRejectionPatterns(user_id);
          break;

        case 'SKILL_VERIFIED':
          await checkProgressMilestones(user_id);
          break;

        case 'APPLICATION_SUBMITTED':
          await trackApplicationVelocity(user_id);
          break;

        case 'ONBOARDING_COMPLETED':
          await recordOnboardingCompletion(user_id);
          break;

        default:
          console.log(`[Strategist] No pattern check for ${event_type}`);
      }

      // Mark as completed (this is for the global listener's own event tracking)
      await markEventCompleted(event_id);

      return {
        success: true,
        processed: true,
        event_type,
        user_id,
      };
    } catch (error) {
      console.error('[Strategist Global Listener] Error:', error);

      await markEventFailed(
        event_id,
        error instanceof Error ? error.message : 'Unknown error'
      );

      // Don't throw - global listener failures shouldn't affect primary handlers
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// =============================================================================
// Pattern Detection Functions
// =============================================================================

/**
 * Detect if user is struggling with interviews
 *
 * Triggers intervention if:
 * - 3+ consecutive low scores
 * - Declining trend in scores
 */
async function checkInterviewPatterns(userId: string): Promise<void> {
  try {
    // Get last 5 interviews
    const recentInterviews = await db.query.interviews.findMany({
      where: eq(interviews.user_id, userId),
      orderBy: [desc(interviews.created_at)],
      limit: 5,
    });

    if (recentInterviews.length < 3) {
      console.log('[Strategist] Not enough interviews for pattern detection');
      return;
    }

    // Check for concerning patterns
    // Note: raw_data.overall_score will be populated when Hume AI is integrated
    const lowScoreCount = recentInterviews.filter((interview) => {
      const score = (interview.raw_data as { overall_score?: number })
        ?.overall_score;
      return score !== undefined && score < 50;
    }).length;

    if (lowScoreCount >= 3) {
      console.log(
        `[Strategist] User ${userId} has ${lowScoreCount} low-scoring interviews`
      );

      // Trigger roadmap repath to focus on fundamentals
      await publishAgentEvent({
        type: 'ROADMAP_REPATH_NEEDED',
        payload: {
          user_id: userId,
          reason: 'interview_performance',
          details: {
            trigger: 'consecutive_low_interview_scores',
            low_score_count: lowScoreCount,
            recommendation: 'focus_on_fundamentals',
          },
        },
      });
    }
  } catch (error) {
    console.error('[Strategist] Error checking interview patterns:', error);
  }
}

/**
 * Detect rejection patterns for strategic intervention
 *
 * Identifies skills that are repeatedly mentioned in rejections
 * and triggers focused improvement
 */
async function checkRejectionPatterns(userId: string): Promise<void> {
  try {
    // Get applications with rejection feedback from last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentApplications = await db.query.jobApplications.findMany({
      where: and(
        eq(jobApplications.user_id, userId),
        eq(jobApplications.status, 'rejected'),
        gte(jobApplications.created_at, thirtyDaysAgo)
      ),
    });

    if (recentApplications.length < 3) {
      console.log('[Strategist] Not enough rejections for pattern detection');
      return;
    }

    // Track rejection frequency
    console.log(
      `[Strategist] User ${userId} has ${recentApplications.length} rejections in last 30 days`
    );

    // TODO: When application_feedback is populated, aggregate gap analysis
    // For now, just log the pattern
  } catch (error) {
    console.error('[Strategist] Error checking rejection patterns:', error);
  }
}

/**
 * Celebrate progress milestones
 *
 * Recognizes when users hit skill verification milestones
 */
async function checkProgressMilestones(userId: string): Promise<void> {
  try {
    // Count verified skills
    const verifiedCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userSkills)
      .where(
        and(
          eq(userSkills.user_id, userId),
          sql`(verification_metadata->>'is_verified')::boolean = true`
        )
      );

    const count = verifiedCount[0]?.count || 0;

    // Milestone thresholds
    const milestones = [5, 10, 25, 50, 100];

    if (milestones.includes(count)) {
      console.log(
        `[Strategist] User ${userId} reached ${count} verified skills milestone!`
      );

      // TODO: Trigger celebration notification
      // await sendNotification(userId, {
      //   type: 'milestone',
      //   title: `${count} Skills Verified!`,
      //   message: `Congratulations! You've verified ${count} skills through interviews.`,
      // });
    }
  } catch (error) {
    console.error('[Strategist] Error checking progress milestones:', error);
  }
}

/**
 * Track application submission velocity
 *
 * Monitors how actively users are applying to jobs
 */
async function trackApplicationVelocity(userId: string): Promise<void> {
  try {
    // Get applications from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const weeklyApplications = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.user_id, userId),
          gte(jobApplications.created_at, sevenDaysAgo)
        )
      );

    const count = weeklyApplications[0]?.count || 0;

    console.log(
      `[Strategist] User ${userId} submitted ${count} applications this week`
    );

    // TODO: Store velocity metric for trend analysis
    // TODO: Alert if velocity drops significantly
  } catch (error) {
    console.error('[Strategist] Error tracking application velocity:', error);
  }
}

/**
 * Record onboarding completion for analytics
 */
async function recordOnboardingCompletion(userId: string): Promise<void> {
  console.log(`[Strategist] User ${userId} completed onboarding`);

  // TODO: Record onboarding analytics
  // - Time to complete
  // - Steps completed vs skipped
  // - Skills claimed
  // - Target roles selected
}
