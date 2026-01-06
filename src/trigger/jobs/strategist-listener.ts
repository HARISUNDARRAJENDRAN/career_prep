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
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import { task, schedules } from '@trigger.dev/sdk';
import { db } from '@/drizzle/db';
import {
  strategicInsights,
  velocityMetrics,
  patternHistory,
  interventionLog,
} from '@/drizzle/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import {
  shouldSkipEvent,
  markEventCompleted,
  markEventFailed,
  publishAgentEvent,
} from '@/lib/agents/message-bus';
import type { AgentEventType } from '@/lib/agents/events';
import {
  createStrategistAgent,
  processStrategicEvent,
  type StrategistOutput,
} from '@/lib/agents/agents/strategist';

interface GlobalListenerPayload {
  event_id: string;
  event_type: AgentEventType;
  user_id: string;
  payload?: Record<string, unknown>;
}

// =============================================================================
// Event-Driven Listener (Primary)
// =============================================================================

/**
 * Main event listener for the Strategist Agent
 * Processes events from the message bus and runs strategic analysis
 */
export const strategistGlobalListener = task({
  id: 'strategist.global-listener',
  retry: {
    maxAttempts: 3,
    factor: 1.5,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
  },
  run: async (payload: GlobalListenerPayload) => {
    const { event_id, event_type, user_id, payload: eventPayload } = payload;
    const startTime = Date.now();

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
      // Determine if this event warrants full strategic analysis
      // =========================================================================
      const significantEvents: AgentEventType[] = [
        'INTERVIEW_COMPLETED',
        'REJECTION_PARSED',
        'REJECTION_RECEIVED',
        'SKILL_VERIFIED',
        'APPLICATION_SUBMITTED',
        'MODULE_COMPLETED',
        'MARKET_UPDATE',
        'JOB_MATCH_FOUND',
        'ROADMAP_GENERATED',
      ];

      const isSignificant = significantEvents.includes(event_type);

      if (isSignificant) {
        // Run full strategic analysis
        const result = await processStrategicEvent(
          user_id,
          event_type,
          eventPayload || {}
        );

        if (result.success && result.output) {
          // Persist strategic insight
          await persistStrategicInsight(user_id, event_type, {
            output: result.output,
            duration_ms: result.duration_ms,
            confidence: result.confidence,
          });

          // Persist detected patterns
          await persistPatterns(user_id, result.output.patterns);

          // Log interventions
          await logInterventions(user_id, result.output.interventions);

          console.log(
            `[Strategist] Analysis complete - Health: ${result.output.overall_health} (${result.output.health_score}/100)`
          );
        } else {
          console.warn(
            `[Strategist] Analysis failed: ${result.reasoning_trace.slice(-1)[0] || 'Unknown'}`
          );
        }
      } else {
        // Lightweight event logging for non-significant events
        console.log(`[Strategist] Event ${event_type} logged (no full analysis)`);
      }

      // Mark as completed
      await markEventCompleted(event_id);

      return {
        success: true,
        processed: true,
        event_type,
        user_id,
        duration_ms: Date.now() - startTime,
        full_analysis: isSignificant,
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
        duration_ms: Date.now() - startTime,
      };
    }
  },
});

// =============================================================================
// Scheduled Jobs
// =============================================================================

/**
 * Daily strategic health check for all active users
 * Runs at 8 AM UTC to catch stalled users and generate daily insights
 */
export const dailyStrategicHealthCheck = schedules.task({
  id: 'strategist.daily-health-check',
  cron: '0 8 * * *', // 8 AM UTC daily
  run: async (payload) => {
    console.log('[Strategist] Running daily health check at:', payload.timestamp);

    try {
      // Get users with recent activity (last 30 days)
      const activeUserIds = await getActiveUserIds(30);
      console.log(`[Strategist] Checking ${activeUserIds.length} active users`);

      const results = {
        processed: 0,
        stalled: 0,
        concerning: 0,
        healthy: 0,
        errors: 0,
      };

      for (const userId of activeUserIds) {
        try {
          const agent = createStrategistAgent(crypto.randomUUID());
          const result = await agent.analyzeCareerProgress({
            task_id: crypto.randomUUID(),
            user_id: userId,
            trigger_event: 'daily_health_check',
            include_recommendations: true,
            include_interventions: true,
          });

          if (result.success && result.output) {
            results.processed++;

            if (result.output.velocity.is_stalled) {
              results.stalled++;
            }
            if (result.output.overall_health === 'concerning') {
              results.concerning++;
            }
            if (
              result.output.overall_health === 'excellent' ||
              result.output.overall_health === 'good'
            ) {
              results.healthy++;
            }

            // Persist the daily insight
            await persistStrategicInsight(userId, 'daily_health_check', {
              output: result.output,
              duration_ms: result.duration_ms,
              confidence: result.confidence,
            });
          }
        } catch (error) {
          console.error(`[Strategist] Error processing user ${userId}:`, error);
          results.errors++;
        }
      }

      console.log('[Strategist] Daily health check complete:', results);

      return {
        success: true,
        results,
        next_run: payload.upcoming[0],
      };
    } catch (error) {
      console.error('[Strategist] Daily health check failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

/**
 * Weekly velocity metrics snapshot
 * Runs every Monday at 6 AM UTC
 */
export const weeklyVelocitySnapshot = schedules.task({
  id: 'strategist.weekly-velocity-snapshot',
  cron: '0 6 * * 1', // 6 AM UTC every Monday
  run: async (payload) => {
    console.log('[Strategist] Running weekly velocity snapshot at:', payload.timestamp);

    try {
      const activeUserIds = await getActiveUserIds(7);
      console.log(`[Strategist] Snapshotting velocity for ${activeUserIds.length} users`);

      const periodEnd = new Date();
      const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      let processed = 0;

      for (const userId of activeUserIds) {
        try {
          const { VelocityTracker } = await import(
            '@/lib/agents/agents/strategist/velocity-tracker'
          );
          const tracker = new VelocityTracker(userId, 7);
          const report = await tracker.generateReport();

          // Persist velocity metric
          await db.insert(velocityMetrics).values({
            user_id: userId,
            period_start: periodStart,
            period_end: periodEnd,
            period_days: 7,
            applications_count: report.current_period.applications_count,
            interviews_count: report.current_period.interviews_count,
            responses_received: report.current_period.responses_received,
            rejections_count: report.current_period.rejections_count,
            offers_count: report.current_period.offers_count,
            modules_completed: report.current_period.modules_completed,
            skills_verified: report.current_period.skills_verified,
            response_rate: String(report.current_period.response_rate),
            pass_rate: String(report.current_period.pass_rate),
            velocity_score: report.velocity_score,
            velocity_level: report.overall_velocity,
            raw_data: {
              trends: report.trends,
              recommendations: report.recommendations,
              previous_period: report.previous_period
                ? {
                    applications_count: report.previous_period.applications_count,
                    interviews_count: report.previous_period.interviews_count,
                    modules_completed: report.previous_period.modules_completed,
                  }
                : undefined,
            },
          });

          processed++;
        } catch (error) {
          console.error(`[Strategist] Error snapshotting velocity for ${userId}:`, error);
        }
      }

      console.log(`[Strategist] Weekly velocity snapshot complete: ${processed} users`);

      return {
        success: true,
        users_processed: processed,
        period: { start: periodStart, end: periodEnd },
        next_run: payload.upcoming[0],
      };
    } catch (error) {
      console.error('[Strategist] Weekly velocity snapshot failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get user IDs with activity in the last N days
 */
async function getActiveUserIds(days: number): Promise<string[]> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get users with recent job applications or interviews
  const result = await db.execute(sql`
    SELECT DISTINCT user_id
    FROM (
      SELECT user_id FROM job_applications WHERE created_at >= ${cutoffDate}
      UNION
      SELECT user_id FROM interviews WHERE created_at >= ${cutoffDate}
      UNION
      SELECT user_id FROM user_skills WHERE updated_at >= ${cutoffDate}
    ) AS active_users
    LIMIT 1000
  `);

  return (result.rows as { user_id: string }[]).map((r) => r.user_id);
}

/**
 * Persist strategic insight to database
 */
async function persistStrategicInsight(
  userId: string,
  triggerEvent: string,
  result: {
    output: StrategistOutput;
    duration_ms: number;
    confidence: number;
  }
): Promise<void> {
  try {
    await db.insert(strategicInsights).values({
      user_id: userId,
      health_score: result.output.health_score,
      overall_health: result.output.overall_health,
      velocity_score: result.output.velocity.score,
      velocity_level: result.output.velocity.overall,
      is_stalled: result.output.velocity.is_stalled,
      days_inactive: result.output.velocity.days_inactive,
      executive_summary: result.output.executive_summary,
      raw_data: {
        patterns: result.output.patterns.map((p) => ({
          type: p.type,
          severity: p.severity,
          description: p.description,
          recommended_action: p.recommended_action,
        })),
        velocity_trends: result.output.velocity.trends,
        recommendations: result.output.recommendations,
        interventions: result.output.interventions,
        strengths: [],
        improvement_areas: [],
      },
      trigger_event: triggerEvent,
      analysis_duration_ms: result.duration_ms,
      confidence_score: String(result.confidence),
    });
  } catch (error) {
    console.error('[Strategist] Error persisting insight:', error);
  }
}

/**
 * Persist detected patterns to history
 */
async function persistPatterns(
  userId: string,
  patterns: Array<{
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommended_action?: string;
    data?: unknown;
  }>
): Promise<void> {
  try {
    for (const pattern of patterns) {
      // Skip milestones - they're one-time celebrations
      if (pattern.type === 'milestone') continue;

      await db.insert(patternHistory).values({
        user_id: userId,
        pattern_type: pattern.type as 'skill_gap_cluster' | 'declining_trend' | 'milestone' | 'stall' | 'velocity_drop',
        severity: pattern.severity,
        description: pattern.description,
        recommended_action: pattern.recommended_action,
        raw_data: pattern.data as Record<string, unknown>,
      });
    }
  } catch (error) {
    console.error('[Strategist] Error persisting patterns:', error);
  }
}

/**
 * Log triggered interventions
 */
async function logInterventions(
  userId: string,
  interventions: Array<{
    action: string;
    reason: string;
    urgency: string;
    payload?: Record<string, unknown>;
  }>
): Promise<void> {
  try {
    for (const intervention of interventions) {
      if (intervention.action === 'NO_ACTION') continue;

      await db.insert(interventionLog).values({
        user_id: userId,
        action: intervention.action as 'REPATH_ROADMAP' | 'NOTIFY_USER' | 'ADJUST_STRATEGY' | 'REQUEST_PRACTICE' | 'CELEBRATE' | 'NO_ACTION',
        urgency: intervention.urgency as 'immediate' | 'soon' | 'when_convenient',
        reason: intervention.reason,
        payload: intervention.payload,
        executed: intervention.urgency === 'immediate', // Immediate interventions are executed by the agent
      });
    }
  } catch (error) {
    console.error('[Strategist] Error logging interventions:', error);
  }
}
