/**
 * Autonomous Roadmap Generator Job - Architect Agent Integration
 *
 * This wraps the new autonomous Architect Agent for use with Trigger.dev.
 * Handles roadmap generation, repathing, and progress evaluation.
 *
 * Triggered: On ONBOARDING_COMPLETED events, skill updates, interview feedback
 *
 * @see src/lib/agents/agents/architect/architect-agent.ts
 */

import { task } from '@trigger.dev/sdk';
import {
  shouldSkipEvent,
  markEventProcessing,
  markEventCompleted,
  markEventFailed,
} from '@/lib/agents/message-bus';
import {
  generateRoadmap,
  repathRoadmap as repathRoadmapFn,
  evaluateProgress as evaluateProgressFn,
  type RoadmapGenerationOutput,
  type RepathOutput,
  type ProgressOutput,
  type RepathContext,
  type ArchitectResult,
} from '@/lib/agents/agents/architect';

// ============================================================================
// Initial Roadmap Generation Task
// ============================================================================

/**
 * Generate initial roadmap for a user
 * Triggered when user completes onboarding
 */
export const generateInitialRoadmap = task({
  id: 'architect.generate-initial-roadmap',
  maxDuration: 180, // 3 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    target_roles?: string[];
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

    console.log(`[Architect] Generating initial roadmap for user ${payload.user_id}...`);

    try {
      // Use the quick roadmap generation function
      const result: ArchitectResult<RoadmapGenerationOutput> = await generateRoadmap(
        payload.user_id,
        { target_roles: payload.target_roles }
      );

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        roadmap_id: result.output?.roadmap_id,
        target_role: result.output?.target_role,
        modules_count: result.output?.modules_count || 0,
        duration_weeks: result.output?.estimated_weeks,
        duration_ms: Date.now() - startTime,
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_trace: result.reasoning_trace,
      };
    } catch (error) {
      console.error(`[Architect] Roadmap generation failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Roadmap Repathing Task
// ============================================================================

/**
 * Repath/update an existing roadmap
 * Triggered when skills change, interview feedback, or market shifts
 */
export const repathRoadmapTask = task({
  id: 'architect.repath-roadmap',
  maxDuration: 180, // 3 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    roadmap_id: string;
    trigger_reason: RepathContext['trigger_reason'];
    trigger_data?: RepathContext['trigger_data'];
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

    console.log(`[Architect] Repathing roadmap for user ${payload.user_id} (reason: ${payload.trigger_reason})...`);

    try {
      const result: ArchitectResult<RepathOutput> = await repathRoadmapFn(
        payload.user_id,
        payload.roadmap_id,
        payload.trigger_reason,
        payload.trigger_data
      );

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        roadmap_id: payload.roadmap_id,
        repathed: result.output?.repathed || false,
        changes_made: result.output?.changes_made || [],
        new_priorities: result.output?.new_priorities || [],
        reasoning: result.output?.reasoning,
        duration_ms: Date.now() - startTime,
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_trace: result.reasoning_trace,
      };
    } catch (error) {
      console.error(`[Architect] Roadmap repathing failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Progress Evaluation Task
// ============================================================================

/**
 * Evaluate user's progress on their roadmap
 * Triggered weekly or on milestone completion
 */
export const evaluateProgressTask = task({
  id: 'architect.evaluate-progress',
  maxDuration: 120, // 2 minutes

  run: async (payload: {
    event_id?: string;
    user_id: string;
    roadmap_id: string;
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

    console.log(`[Architect] Evaluating progress for user ${payload.user_id}...`);

    try {
      const result: ArchitectResult<ProgressOutput> = await evaluateProgressFn(
        payload.user_id,
        payload.roadmap_id
      );

      if (payload.event_id) {
        await markEventCompleted(payload.event_id);
      }

      return {
        success: result.success,
        user_id: payload.user_id,
        roadmap_id: payload.roadmap_id,
        overall_progress: result.output?.overall_progress,
        pace: result.output?.pace,
        modules_completed: result.output?.modules_completed,
        estimated_completion: result.output?.estimated_completion,
        recommendations: result.output?.recommendations || [],
        motivational_message: result.output?.motivational_message,
        duration_ms: Date.now() - startTime,
        iterations: result.iterations,
        confidence: result.confidence,
        reasoning_trace: result.reasoning_trace,
      };
    } catch (error) {
      console.error(`[Architect] Progress evaluation failed for user ${payload.user_id}:`, error);

      if (payload.event_id) {
        await markEventFailed(payload.event_id, (error as Error).message);
      }

      throw error;
    }
  },
});

// ============================================================================
// Onboarding Completed Handler
// ============================================================================

/**
 * Handler for ONBOARDING_COMPLETED event
 * Triggers initial roadmap generation
 */
export const handleOnboardingCompleted = task({
  id: 'architect.handle-onboarding-completed',
  maxDuration: 180,

  run: async (payload: {
    event_id: string;
    user_id: string;
    target_roles: string[];
    skills_count: number;
  }) => {
    console.log(`[Architect] Handling onboarding completed for user ${payload.user_id}`);

    // Delegate to roadmap generation
    const handle = await generateInitialRoadmap.trigger({
      event_id: payload.event_id,
      user_id: payload.user_id,
      target_roles: payload.target_roles,
    });

    return {
      delegated: true,
      task_id: handle.id,
    };
  },
});

export default {
  generateInitialRoadmap,
  repathRoadmapTask,
  evaluateProgressTask,
  handleOnboardingCompleted,
};
