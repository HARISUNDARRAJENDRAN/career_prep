/**
 * Agent Message Bus
 *
 * Central hub for inter-agent communication. All agent events flow through
 * this service, which:
 *
 * 1. Persists events to the database (audit trail)
 * 2. Dispatches events to appropriate Trigger.dev background jobs
 * 3. Handles idempotency checks to prevent double-processing
 * 4. Routes events to priority queues based on urgency
 *
 * Senior Engineer Refinements:
 * - Idempotency: Uses event ID to prevent duplicate processing
 * - Priority Queuing: Routes high-priority events to faster queues
 * - Global Listener: Strategist agent receives all events for pattern detection
 */

import { db } from '@/drizzle/db';
import { agentEvents } from '@/drizzle/schema';
import { eq } from 'drizzle-orm';
import {
  type AgentEventUnion,
  EVENT_SOURCE_AGENTS,
  EVENT_TARGET_AGENTS,
  EVENT_PRIORITIES,
  EVENT_JOB_IDS,
  getQueueForEvent,
} from './events';

// ============================================================================
// Types
// ============================================================================

export interface PublishResult {
  success: boolean;
  eventId: string;
  dispatched: boolean;
  error?: string;
}

export interface IdempotencyCheckResult {
  skip: boolean;
  reason?: 'already_completed' | 'already_processing' | 'not_found';
}

// ============================================================================
// Main Public API
// ============================================================================

/**
 * Publish an agent event to the message bus
 *
 * This is the main entry point for all inter-agent communication.
 * Events are persisted to the database and dispatched to background jobs.
 *
 * @param event - The typed agent event to publish
 * @returns PublishResult with event ID and dispatch status
 *
 * @example
 * ```ts
 * await publishAgentEvent({
 *   type: 'INTERVIEW_COMPLETED',
 *   payload: {
 *     interview_id: '123',
 *     user_id: 'user_456',
 *     duration_minutes: 45,
 *     interview_type: 'reality_check',
 *   },
 * });
 * ```
 */
export async function publishAgentEvent(
  event: AgentEventUnion
): Promise<PublishResult> {
  const eventType = event.type;
  const targetAgents = EVENT_TARGET_AGENTS[eventType];
  const sourceAgent = EVENT_SOURCE_AGENTS[eventType];
  const priority = EVENT_PRIORITIES[eventType];

  // 1. Persist to database for audit trail
  let eventId: string;
  try {
    const [insertedEvent] = await db
      .insert(agentEvents)
      .values({
        event_type: eventType,
        payload: event.payload,
        status: 'pending',
        priority,
        source_agent: sourceAgent,
        target_agent: targetAgents[0], // Primary target
      })
      .returning({ id: agentEvents.id });

    eventId = insertedEvent.id;
  } catch (error) {
    console.error(`Failed to persist event ${eventType}:`, error);
    return {
      success: false,
      eventId: '',
      dispatched: false,
      error: error instanceof Error ? error.message : 'Failed to persist event',
    };
  }

  // 2. Dispatch to Trigger.dev background job
  try {
    await dispatchToTrigger(event, eventId);

    // NOTE: Don't set status to 'processing' here!
    // The task itself will update the status after the idempotency check passes.
    // Setting it here causes a race condition where the task sees 'processing' and skips.

    return {
      success: true,
      eventId,
      dispatched: true,
    };
  } catch (error) {
    // Log failure but don't throw - event is persisted for manual retry
    console.error(`Failed to dispatch event ${eventType}:`, error);

    await db
      .update(agentEvents)
      .set({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Dispatch failed',
      })
      .where(eq(agentEvents.id, eventId));

    return {
      success: true, // Event was persisted
      eventId,
      dispatched: false,
      error: error instanceof Error ? error.message : 'Dispatch failed',
    };
  }
}

// ============================================================================
// Idempotency Helpers (Senior Engineer Refinement #1)
// ============================================================================

/**
 * Check if an event has already been processed (idempotency check)
 *
 * CRITICAL: Call this at the START of every job handler to prevent
 * double-processing due to network retries or duplicate webhook delivery.
 *
 * @param eventId - The event ID (idempotency key)
 * @returns Object indicating whether to skip and why
 *
 * @example
 * ```ts
 * export const myJob = task({
 *   id: 'my.job',
 *   run: async (payload: { event_id: string }) => {
 *     const check = await shouldSkipEvent(payload.event_id);
 *     if (check.skip) {
 *       return { skipped: true, reason: check.reason };
 *     }
 *     // Proceed with job logic...
 *   },
 * });
 * ```
 */
export async function shouldSkipEvent(
  eventId: string
): Promise<IdempotencyCheckResult> {
  const event = await db.query.agentEvents.findFirst({
    where: eq(agentEvents.id, eventId),
  });

  if (!event) {
    console.warn(`Event ${eventId} not found in database`);
    return { skip: true, reason: 'not_found' };
  }

  // Already completed - definitely skip
  if (event.status === 'completed') {
    console.log(`Event ${eventId} already completed, skipping`);
    return { skip: true, reason: 'already_completed' };
  }

  // Already processing - skip if started recently (< 5 minutes)
  // This prevents race conditions while allowing stuck jobs to be retried
  if (event.status === 'processing') {
    const processingTime = Date.now() - event.created_at.getTime();
    const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    if (processingTime < STUCK_THRESHOLD_MS) {
      console.log(`Event ${eventId} already processing, skipping`);
      return { skip: true, reason: 'already_processing' };
    }

    // Job is stuck - allow retry
    console.warn(`Event ${eventId} stuck in processing, allowing retry`);
  }

  return { skip: false };
}

/**
 * Mark an event as processing
 * Call this AFTER the idempotency check passes, before starting actual work
 */
export async function markEventProcessing(eventId: string): Promise<void> {
  await db
    .update(agentEvents)
    .set({ status: 'processing' })
    .where(eq(agentEvents.id, eventId));
}

// ============================================================================
// Event Status Updates (Called by Job Handlers)
// ============================================================================

/**
 * Mark an event as completed
 * Call this at the end of a successful job execution
 */
export async function markEventCompleted(eventId: string): Promise<void> {
  await db
    .update(agentEvents)
    .set({
      status: 'completed',
      processed_at: new Date(),
    })
    .where(eq(agentEvents.id, eventId));
}

/**
 * Mark an event as failed with an error message
 * Call this when a job fails after exhausting retries
 */
export async function markEventFailed(
  eventId: string,
  errorMessage: string
): Promise<void> {
  await db
    .update(agentEvents)
    .set({
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date(),
    })
    .where(eq(agentEvents.id, eventId));
}

/**
 * Increment retry count for an event
 * Call this when a job fails but will be retried
 */
export async function incrementRetryCount(eventId: string): Promise<void> {
  const event = await db.query.agentEvents.findFirst({
    where: eq(agentEvents.id, eventId),
  });

  if (event) {
    await db
      .update(agentEvents)
      .set({
        retry_count: event.retry_count + 1,
      })
      .where(eq(agentEvents.id, eventId));
  }
}

// ============================================================================
// Internal Dispatch Logic
// ============================================================================

/**
 * Dispatch event to appropriate Trigger.dev job
 *
 * NOTE: This function will skip dispatch if Trigger.dev is not installed or configured.
 * In development without Trigger.dev, events are still persisted to DB.
 */
async function dispatchToTrigger(
  event: AgentEventUnion,
  eventId: string
): Promise<void> {
  // Get the job ID and queue for this event type
  const jobId = EVENT_JOB_IDS[event.type];
  const queue = getQueueForEvent(event.type);

  // Build the payload with event_id for idempotency
  const jobPayload = {
    ...event.payload,
    event_id: eventId,
    _metadata: {
      event_type: event.type,
      priority: EVENT_PRIORITIES[event.type],
      queue,
    },
  };

  // Check if Trigger.dev is available
  const secretKey = process.env.TRIGGER_SECRET_KEY;
  if (!secretKey) {
    console.warn(
      `[Message Bus] Trigger.dev not configured. Event ${event.type} persisted but not dispatched.`
    );
    console.log(`[Message Bus] Would dispatch to job: ${jobId}`, jobPayload);
    return;
  }

  // Trigger.dev dispatch logic
  // NOTE: Queue parameter removed temporarily - queues must be defined with queue() in v4
  console.log(`[Message Bus] Dispatching ${event.type} to ${jobId}`);

  try {
    // Import and configure the Trigger.dev SDK
    const { tasks, configure } = await import('@trigger.dev/sdk');

    // Configure the SDK with the secret key
    configure({
      secretKey,
    });

    // Dispatch to the primary job handler (without queue - queues need to be defined first)
    const primaryHandle = await tasks.trigger(jobId, jobPayload);
    console.log(`[Message Bus] Primary job triggered: ${primaryHandle.id}`);

    // Also dispatch to global listener (Strategist pattern - Senior Engineer Refinement #3)
    // This enables cross-cutting concerns and pattern detection across all agents
    if ('user_id' in event.payload) {
      const globalHandle = await tasks.trigger('strategist.global-listener', {
        event_id: eventId,
        event_type: event.type,
        user_id: (event.payload as { user_id: string }).user_id,
      });
      console.log(`[Message Bus] Global listener triggered: ${globalHandle.id}`);
    }
  } catch (error) {
    console.error(`[Message Bus] Failed to dispatch to Trigger.dev:`, error);
    throw error;
  }
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Get pending events for manual processing/retry
 */
export async function getPendingEvents(limit = 100) {
  return db.query.agentEvents.findMany({
    where: eq(agentEvents.status, 'pending'),
    orderBy: (events, { desc, asc }) => [
      desc(events.priority),
      asc(events.created_at),
    ],
    limit,
  });
}

/**
 * Get failed events for investigation
 */
export async function getFailedEvents(limit = 100) {
  return db.query.agentEvents.findMany({
    where: eq(agentEvents.status, 'failed'),
    orderBy: (events, { desc }) => [desc(events.created_at)],
    limit,
  });
}

/**
 * Get recent events for a specific user (for debugging)
 */
export async function getUserEvents(userId: string, limit = 50) {
  // Note: This requires the payload to have a user_id field
  // We use a raw SQL query for JSONB filtering
  const { sql } = await import('drizzle-orm');

  return db.query.agentEvents.findMany({
    where: sql`payload->>'user_id' = ${userId}`,
    orderBy: (events, { desc }) => [desc(events.created_at)],
    limit,
  });
}
