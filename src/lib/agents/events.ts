/**
 * Agent Event Types
 *
 * This file defines all event types that flow through the agent message bus.
 * Each event represents a significant action or state change that other agents
 * may need to react to.
 *
 * Architecture:
 * - Events are published by source agents
 * - Events are consumed by target agents via Trigger.dev background jobs
 * - The Strategist agent subscribes to ALL events as a global listener
 */

// ============================================================================
// Event Type Definitions (Discriminated Union)
// ============================================================================

/**
 * All possible agent events with their typed payloads.
 * Using a discriminated union ensures type safety when handling events.
 */
export type AgentEventUnion =
  // -------------------------------------------------------------------------
  // System Events
  // -------------------------------------------------------------------------
  | {
      type: 'ONBOARDING_COMPLETED';
      payload: {
        user_id: string;
        target_roles: string[];
        skills_count: number;
        has_resume: boolean;
      };
    }

  // -------------------------------------------------------------------------
  // Interviewer Agent Events
  // -------------------------------------------------------------------------
  | {
      type: 'INTERVIEW_COMPLETED';
      payload: {
        interview_id: string;
        user_id: string;
        duration_minutes: number;
        interview_type: 'reality_check' | 'weekly_sprint' | 'skill_deep_dive';
      };
    }
  | {
      type: 'SKILL_VERIFIED';
      payload: {
        user_id: string;
        skill_id: string;
        user_skill_id: string;
        confidence: number; // 0-1
        verification_type: 'live_coding' | 'concept_explanation' | 'project_demo';
        transcript_snippet: string;
      };
    }

  // -------------------------------------------------------------------------
  // Sentinel Agent Events (Market Intelligence)
  // -------------------------------------------------------------------------
  | {
      type: 'MARKET_UPDATE';
      payload: {
        skills: string[];
        demand_scores: Record<string, number>;
        trending_roles: string[];
        region?: string;
        job_count: number;
      };
    }
  | {
      type: 'JOB_MATCH_FOUND';
      payload: {
        user_id: string;
        job_listing_id: string;
        match_score: number; // 0-100
        matching_skills: string[];
        missing_skills: string[];
      };
    }

  // -------------------------------------------------------------------------
  // Strategist Agent Events (Feedback & Re-pathing)
  // -------------------------------------------------------------------------
  | {
      type: 'REJECTION_PARSED';
      payload: {
        application_id: string;
        user_id: string;
        gaps: string[];
        recommended_skills: string[];
        rejection_reason?: string;
      };
    }
  | {
      type: 'ROADMAP_REPATH_NEEDED';
      payload: {
        user_id: string;
        reason:
          | 'skill_verification_gaps'
          | 'market_shift'
          | 'rejection_feedback'
          | 'user_request'
          | 'interview_performance';
        details: Record<string, unknown>;
      };
    }

  // -------------------------------------------------------------------------
  // Action Agent Events (Job Applications)
  // -------------------------------------------------------------------------
  | {
      type: 'AUTO_APPLY_TRIGGERED';
      payload: {
        user_id: string;
        job_listing_id: string;
        document_id: string;
        confidence_score: number;
      };
    }
  | {
      type: 'APPLICATION_SUBMITTED';
      payload: {
        application_id: string;
        user_id: string;
        job_listing_id: string | null;
        method: 'auto' | 'manual';
        match_score?: number;
        cover_letter_id?: string;
      };
    };

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract event type string literals for type guards
 */
export type AgentEventType = AgentEventUnion['type'];

/**
 * Extract payload type for a specific event type
 * Usage: AgentEventPayload<'INTERVIEW_COMPLETED'>
 */
export type AgentEventPayload<T extends AgentEventType> = Extract<
  AgentEventUnion,
  { type: T }
>['payload'];

/**
 * Agent identifiers for routing and logging
 */
export type AgentName =
  | 'system'
  | 'interviewer'
  | 'sentinel'
  | 'architect'
  | 'action'
  | 'strategist';

// ============================================================================
// Event Routing Configuration
// ============================================================================

/**
 * Maps each event type to the agents that should handle it.
 * The first agent in the array is the "primary" handler.
 * Additional agents are secondary handlers that may also react to the event.
 */
export const EVENT_TARGET_AGENTS: Record<AgentEventType, AgentName[]> = {
  // System events
  ONBOARDING_COMPLETED: ['architect', 'sentinel'],

  // Interviewer events
  INTERVIEW_COMPLETED: ['strategist'],
  SKILL_VERIFIED: ['architect', 'action'],

  // Sentinel events
  MARKET_UPDATE: ['architect', 'strategist'],
  JOB_MATCH_FOUND: ['action'],

  // Strategist events
  REJECTION_PARSED: ['strategist', 'architect'],
  ROADMAP_REPATH_NEEDED: ['architect'],

  // Action events
  AUTO_APPLY_TRIGGERED: ['action'],
  APPLICATION_SUBMITTED: ['strategist'],
};

/**
 * Maps each event type to its source agent.
 * Used for audit logging and debugging.
 */
export const EVENT_SOURCE_AGENTS: Record<AgentEventType, AgentName> = {
  ONBOARDING_COMPLETED: 'system',
  INTERVIEW_COMPLETED: 'interviewer',
  SKILL_VERIFIED: 'interviewer',
  MARKET_UPDATE: 'sentinel',
  JOB_MATCH_FOUND: 'sentinel',
  REJECTION_PARSED: 'strategist',
  ROADMAP_REPATH_NEEDED: 'strategist',
  AUTO_APPLY_TRIGGERED: 'action',
  APPLICATION_SUBMITTED: 'action',
};

// ============================================================================
// Priority Configuration (Senior Engineer Refinement #2)
// ============================================================================

/**
 * Event priority for queue routing (1=lowest, 10=highest)
 *
 * Priority Guidelines:
 * - 10: User is actively waiting (real-time expectations)
 * - 7:  User triggered, moderate urgency
 * - 5:  System triggered, no immediate user expectation
 * - 3:  Background processing, can be delayed
 * - 1:  Bulk operations, lowest priority
 */
export const EVENT_PRIORITIES: Record<AgentEventType, number> = {
  // User-facing, real-time expectations (Priority 10)
  INTERVIEW_COMPLETED: 10,
  SKILL_VERIFIED: 10,

  // User-triggered, moderate urgency (Priority 7)
  ONBOARDING_COMPLETED: 7,
  AUTO_APPLY_TRIGGERED: 7,

  // System-triggered, no user waiting (Priority 5)
  REJECTION_PARSED: 5,
  ROADMAP_REPATH_NEEDED: 5,

  // Background processing (Priority 3)
  JOB_MATCH_FOUND: 3,
  APPLICATION_SUBMITTED: 3,

  // Bulk operations (Priority 1)
  MARKET_UPDATE: 1,
};

/**
 * Queue names for Trigger.dev routing based on priority
 */
export type QueueName = 'high-priority' | 'default' | 'low-priority';

/**
 * Get the appropriate queue for an event based on its priority
 */
export function getQueueForEvent(eventType: AgentEventType): QueueName {
  const priority = EVENT_PRIORITIES[eventType];

  if (priority >= 7) return 'high-priority';
  if (priority >= 3) return 'default';
  return 'low-priority';
}

// ============================================================================
// Trigger.dev Job IDs
// ============================================================================

/**
 * Mapping of event types to their Trigger.dev job IDs
 * These IDs must match the `id` field in the task definitions
 */
export const EVENT_JOB_IDS: Record<AgentEventType, string> = {
  ONBOARDING_COMPLETED: 'architect.generate-initial-roadmap',
  INTERVIEW_COMPLETED: 'interview.analyze',
  SKILL_VERIFIED: 'architect.update-skill-status',
  MARKET_UPDATE: 'roadmap.repath.check',
  JOB_MATCH_FOUND: 'action.evaluate-match',
  REJECTION_PARSED: 'strategist.process-rejection',
  ROADMAP_REPATH_NEEDED: 'architect.repath-roadmap',
  AUTO_APPLY_TRIGGERED: 'action.execute-apply',
  APPLICATION_SUBMITTED: 'strategist.track-application',
};
