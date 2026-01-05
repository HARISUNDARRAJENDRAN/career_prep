/**
 * Autonomous Market Scraper Job - Sentinel Agent Integration
 *
 * This wraps the new autonomous Sentinel Agent for use with Trigger.dev.
 * The actual scraping logic has been moved to the SentinelAgent class.
 *
 * Triggered: Daily via cron schedule (2 AM UTC)
 *
 * @see src/lib/agents/agents/sentinel/sentinel-agent.ts
 */

import { task, schedules } from '@trigger.dev/sdk';
import {
  shouldSkipEvent,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';
import { createSentinelAgent, type MarketScrapeOutput, type JobMatchOutput, type SentinelResult } from '@/lib/agents/agents/sentinel';

// ============================================================================
// Scheduled Scraper Task (Autonomous Version)
// ============================================================================

/**
 * Daily market scraping using autonomous Sentinel Agent
 */
export const dailyMarketScraper = task({
  id: 'sentinel.daily-market-scrape',
  maxDuration: 600, // 10 minutes

  run: async (payload: {
    event_id?: string;
    force?: boolean;
    keywords?: string[];
  }) => {
    const startTime = Date.now();
    const taskId = crypto.randomUUID();

    // Idempotency check if event_id provided
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return {
          skipped: true,
          reason: check.reason,
        };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log('[Sentinel] Starting autonomous daily market scrape...');

    try {
      // Create autonomous Sentinel agent
      const agent = createSentinelAgent(taskId, {
        max_iterations: 3,
        confidence_threshold: 0.80,
        timeout_ms: 300000,
        enable_learning: true,
      });

      // Execute market scraping
      const result: SentinelResult<MarketScrapeOutput> = await agent.scrapeMarket({
        task_id: taskId,
        keywords: payload.keywords || ['software engineer', 'developer', 'full stack'],
        include_github: true,
        force_refresh: payload.force,
      });

      // Mark event completed if applicable
      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        jobs_scraped: result.output?.jobs_scraped || 0,
        jobs_stored: result.output?.jobs_inserted || 0,
        skills_extracted: result.output?.trending_skills || [],
        insights_generated: result.output?.market_shifts?.length || 0,
        duration_ms: Date.now() - startTime,
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_trace: result.reasoning_trace,
      };
    } catch (error) {
      console.error('[Sentinel] Daily market scrape failed:', error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

/**
 * User-specific job matching using autonomous Sentinel Agent
 */
export const matchJobsForUser = task({
  id: 'sentinel.match-jobs-for-user',
  maxDuration: 120, // 2 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    min_match_score?: number;
    max_matches?: number;
  }) => {
    const startTime = Date.now();
    const taskId = crypto.randomUUID();

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log(`[Sentinel] Matching jobs for user ${payload.user_id}...`);

    try {
      const agent = createSentinelAgent(taskId);
      const result: SentinelResult<JobMatchOutput> = await agent.matchJobsForUser({
        task_id: taskId,
        user_id: payload.user_id,
        min_match_score: payload.min_match_score,
        max_results: payload.max_matches,
      });

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        matches_found: result.output?.matches?.length || 0,
        matches: result.output?.matches || [],
        duration_ms: Date.now() - startTime,
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_trace: result.reasoning_trace,
      };
    } catch (error) {
      console.error(`[Sentinel] Job matching failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

/**
 * Batch job matching for all users
 */
export const batchMatchAllUsers = task({
  id: 'sentinel.batch-match-all-users',
  maxDuration: 300, // 5 minutes

  run: async (payload: {
    event_id?: string;
    min_match_score?: number;
    max_matches_per_user?: number;
  }) => {
    const startTime = Date.now();

    // Import DB dependencies
    const { db } = await import('@/drizzle/db');
    const { users, userProfiles } = await import('@/drizzle/schema');
    const { eq, and } = await import('drizzle-orm');

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log('[Sentinel] Starting batch job matching for all users...');

    try {
      // Get all active users with auto-apply enabled
      const activeUsers = await db.query.userProfiles.findMany({
        where: eq(userProfiles.auto_apply_enabled, true),
        columns: { user_id: true },
      });

      const userIds = activeUsers.map((u) => u.user_id);
      console.log(`[Sentinel] Found ${userIds.length} users for matching`);

      // Use fan-out pattern for parallel processing
      const { fanOutFanIn } = await import('@/lib/agents/workflows/workflow-patterns');

      const result = await fanOutFanIn({
        name: 'batch_job_matching',
        inputs: userIds,
        executor: async (userId) => {
          const taskId = crypto.randomUUID();
          const agent = createSentinelAgent(taskId);
          const matchResult: SentinelResult<JobMatchOutput> = await agent.matchJobsForUser({
            task_id: taskId,
            user_id: userId,
            min_match_score: payload.min_match_score,
            max_results: payload.max_matches_per_user,
          });
          return {
            user_id: userId,
            matches: matchResult.output?.matches?.length || 0,
            success: matchResult.success,
          };
        },
        concurrency: 5,
        timeout_ms: 30000,
      });

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      const totalMatches = result.results.reduce((sum, r) => sum + (r.matches || 0), 0);

      return {
        success: true,
        users_processed: result.completed,
        users_failed: result.failed,
        total_matches: totalMatches,
        duration_ms: Date.now() - startTime,
        results: result.results,
        errors: result.errors,
      };
    } catch (error) {
      console.error('[Sentinel] Batch matching failed:', error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Schedule Registration
// ============================================================================

/**
 * Register the daily market scraper schedule
 */
schedules.task({
  id: 'sentinel.daily-market-scraper-schedule',
  cron: '0 2 * * *', // Run at 2 AM UTC daily
  run: async () => {
    return dailyMarketScraper.trigger({});
  },
});

export default {
  dailyMarketScraper,
  matchJobsForUser,
  batchMatchAllUsers,
};
