/**
 * Autonomous Auto-Applier Job - Action Agent Integration
 *
 * This wraps the new autonomous Action Agent for use with Trigger.dev.
 * Handles job application automation, cover letter generation, and follow-ups.
 *
 * Triggered: On JOB_MATCH_FOUND events, batch application requests
 *
 * @see src/lib/agents/agents/action/action-agent.ts
 */

import { task } from '@trigger.dev/sdk';
import {
  shouldSkipEvent,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';
import {
  createApplicationAgent,
  createBatchApplicationAgent,
  createFollowUpAgent,
  createPrioritizationAgent,
} from '@/lib/agents/agents/action';

// ============================================================================
// Single Job Application Task
// ============================================================================

/**
 * Apply to a single job
 * Triggered on JOB_MATCH_FOUND event
 */
export const applyToJob = task({
  id: 'action.apply-to-job',
  maxDuration: 120, // 2 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    job_listing_id: string;
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  }) => {
    const startTime = Date.now();

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log(`[Action] Applying to job ${payload.job_listing_id} for user ${payload.user_id}...`);

    try {
      // Create autonomous Action agent
      const agent = createApplicationAgent(
        payload.user_id,
        payload.job_listing_id,
        {
          match_score: payload.match_score,
          matching_skills: payload.matching_skills,
          missing_skills: payload.missing_skills,
        }
      );

      // Execute application
      const result = await agent.applyToJob();

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        job_id: payload.job_listing_id,
        applications_created: result.applications_created,
        applications_skipped: result.applications_skipped,
        application: result.applications?.[0],
        duration_ms: Date.now() - startTime,
        agent_stats: result.stats,
        errors: result.errors,
      };
    } catch (error) {
      console.error(`[Action] Job application failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Batch Application Task
// ============================================================================

/**
 * Apply to multiple jobs in batch
 */
export const batchApply = task({
  id: 'action.batch-apply',
  maxDuration: 300, // 5 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    job_ids: string[];
    max_applications?: number;
  }) => {
    const startTime = Date.now();

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log(`[Action] Batch applying to ${payload.job_ids.length} jobs for user ${payload.user_id}...`);

    try {
      const agent = createBatchApplicationAgent(
        payload.user_id,
        payload.max_applications
      );

      const result = await agent.batchApply(payload.job_ids);

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        applications_created: result.applications_created,
        applications_skipped: result.applications_skipped,
        applications: result.applications,
        prioritized_jobs: result.prioritized_jobs,
        duration_ms: Date.now() - startTime,
        agent_stats: result.stats,
        errors: result.errors,
      };
    } catch (error) {
      console.error(`[Action] Batch application failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Follow-Up Analysis Task
// ============================================================================

/**
 * Analyze applications for follow-up opportunities
 */
export const analyzeFollowUps = task({
  id: 'action.analyze-followups',
  maxDuration: 180, // 3 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    application_ids?: string[];
  }) => {
    const startTime = Date.now();

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log(`[Action] Analyzing follow-ups for user ${payload.user_id}...`);

    try {
      // Get application IDs if not provided
      let applicationIds = payload.application_ids;
      if (!applicationIds || applicationIds.length === 0) {
        const { db } = await import('@/drizzle/db');
        const { jobApplications } = await import('@/drizzle/schema');
        const { eq, and, sql, lt } = await import('drizzle-orm');

        // Get applications that are applied but not followed up in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const applications = await db.query.jobApplications.findMany({
          where: and(
            eq(jobApplications.user_id, payload.user_id),
            eq(jobApplications.status, 'applied'),
            lt(jobApplications.applied_at, sevenDaysAgo)
          ),
          columns: { id: true },
          limit: 20,
        });

        applicationIds = applications.map((a) => a.id);
      }

      if (applicationIds.length === 0) {
        return {
          success: true,
          user_id: payload.user_id,
          message: 'No applications need follow-up',
          followups: [],
          duration_ms: Date.now() - startTime,
        };
      }

      const agent = createFollowUpAgent(payload.user_id);
      const result = await agent.analyzeFollowUps(applicationIds);

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        followups: result.followups,
        duration_ms: Date.now() - startTime,
        agent_stats: result.stats,
        errors: result.errors,
      };
    } catch (error) {
      console.error(`[Action] Follow-up analysis failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Job Prioritization Task
// ============================================================================

/**
 * Prioritize job opportunities for application
 */
export const prioritizeJobs = task({
  id: 'action.prioritize-jobs',
  maxDuration: 120, // 2 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    job_ids: string[];
  }) => {
    const startTime = Date.now();

    // Idempotency check
    if (payload.event_id) {
      const check = await shouldSkipEvent(payload.event_id);
      if (check.skip) {
        return { skipped: true, reason: check.reason };
      }
      await markEventProcessing(payload.event_id);
    }

    console.log(`[Action] Prioritizing ${payload.job_ids.length} jobs for user ${payload.user_id}...`);

    try {
      const agent = createPrioritizationAgent(payload.user_id);
      const result = await agent.prioritizeJobs(payload.job_ids);

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        prioritized_jobs: result.prioritized_jobs,
        duration_ms: Date.now() - startTime,
        agent_stats: result.stats,
        errors: result.errors,
      };
    } catch (error) {
      console.error(`[Action] Job prioritization failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Job Match Handler
// ============================================================================

/**
 * Handler for JOB_MATCH_FOUND event
 * Evaluates and potentially applies to matched job
 */
export const handleJobMatchFound = task({
  id: 'action.handle-job-match-found',
  maxDuration: 180,

  run: async (payload: {
    event_id: string;
    user_id: string;
    job_id: string;
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  }) => {
    console.log(`[Action] Handling job match found for user ${payload.user_id}, job ${payload.job_id}`);

    // Check if auto-apply is enabled for this user
    const { db } = await import('@/drizzle/db');
    const { userProfiles } = await import('@/drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.user_id, payload.user_id),
    });

    if (!profile?.auto_apply_enabled) {
      console.log(`[Action] Auto-apply disabled for user ${payload.user_id}, skipping`);
      return {
        skipped: true,
        reason: 'auto_apply_disabled',
      };
    }

    // Check minimum match score
    const minScore = profile.auto_apply_threshold || 70;
    if (payload.match_score < minScore) {
      console.log(`[Action] Match score ${payload.match_score} below threshold ${minScore}, skipping`);
      return {
        skipped: true,
        reason: 'below_match_threshold',
        match_score: payload.match_score,
        min_score: minScore,
      };
    }

    // Delegate to application task
    const { tasks } = await import('@trigger.dev/sdk');

    const handle = await tasks.trigger('action.apply-to-job', {
      event_id: payload.event_id,
      user_id: payload.user_id,
      job_listing_id: payload.job_id,
      match_score: payload.match_score,
      matching_skills: payload.matching_skills,
      missing_skills: payload.missing_skills,
    });

    return {
      delegated: true,
      task_id: handle.id,
    };
  },
});

export default {
  applyToJob,
  batchApply,
  analyzeFollowUps,
  prioritizeJobs,
  handleJobMatchFound,
};
