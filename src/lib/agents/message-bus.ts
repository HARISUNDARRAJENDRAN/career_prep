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

// ============================================================================
// Enhanced Inter-Agent Communication (Phase 5)
// ============================================================================

/**
 * Message Topics for pub/sub communication
 */
export const MessageTopics = {
  // Interview events
  INTERVIEW_STARTED: 'interview_started',
  INTERVIEW_COMPLETED: 'interview_completed',
  INTERVIEW_FEEDBACK_READY: 'interview_feedback_ready',

  // Job/Market events
  JOB_MATCH_FOUND: 'job_match_found',
  MARKET_TRENDS_UPDATED: 'market_trends_updated',
  SKILLS_EXTRACTED: 'skills_extracted',

  // Roadmap events
  ROADMAP_CREATED: 'roadmap_created',
  ROADMAP_UPDATED: 'roadmap_updated',
  PROGRESS_MILESTONE: 'progress_milestone',

  // Application events
  APPLICATION_SUBMITTED: 'application_submitted',
  APPLICATION_STATUS_CHANGED: 'application_status_changed',

  // System events
  AGENT_STATE_CHANGED: 'agent_state_changed',
  CONFLICT_DETECTED: 'conflict_detected',
  CONFLICT_RESOLVED: 'conflict_resolved',
  WORKFLOW_STARTED: 'workflow_started',
  WORKFLOW_COMPLETED: 'workflow_completed',

  // Onboarding
  ONBOARDING_COMPLETED: 'onboarding_completed',
} as const;

export type MessageTopic = keyof typeof MessageTopics;

/**
 * Typed payloads for each message topic
 */
export interface MessagePayloads {
  interview_started: {
    session_id: string;
    user_id: string;
    interview_type: string;
  };
  interview_completed: {
    session_id: string;
    user_id: string;
    duration_ms: number;
    overall_score: number;
  };
  interview_feedback_ready: {
    session_id: string;
    user_id: string;
    feedback_id: string;
  };
  job_match_found: {
    user_id: string;
    job_id: string;
    match_score: number;
    matching_skills: string[];
    missing_skills: string[];
  };
  market_trends_updated: {
    timestamp: string;
    trends: Array<{ skill: string; demand_change: number }>;
  };
  skills_extracted: {
    job_id: string;
    skills: string[];
    source: string;
  };
  roadmap_created: {
    user_id: string;
    roadmap_id: string;
    target_role: string;
    modules_count: number;
  };
  roadmap_updated: {
    user_id: string;
    roadmap_id: string;
    reason: string;
  };
  progress_milestone: {
    user_id: string;
    roadmap_id: string;
    milestone: string;
    progress_percentage: number;
  };
  application_submitted: {
    user_id: string;
    application_id: string;
    job_id: string;
    company: string;
    status: string;
  };
  application_status_changed: {
    application_id: string;
    old_status: string;
    new_status: string;
  };
  agent_state_changed: {
    agent_id: string;
    agent_type: string;
    old_state: string;
    new_state: string;
  };
  conflict_detected: {
    conflict_id: string;
    conflict_type: string;
    sources: string[];
  };
  conflict_resolved: {
    conflict_id: string;
    conflict_type: string;
    strategy: string;
    result: unknown;
  };
  workflow_started: {
    workflow_id: string;
    execution_id: string;
    trigger_data: unknown;
  };
  workflow_completed: {
    workflow_id: string;
    execution_id: string;
    status: string;
    duration_ms: number;
  };
  onboarding_completed: {
    user_id: string;
    target_roles: string[];
    skills_count: number;
  };
}

/**
 * Subscription handler type
 */
type SubscriptionHandler<T> = (payload: T) => void | Promise<void>;

/**
 * In-memory pub/sub message bus for real-time agent communication
 * This supplements the database-persisted events with fast local messaging
 */
class InMemoryMessageBus {
  private subscriptions: Map<string, Set<SubscriptionHandler<unknown>>> = new Map();
  private messageHistory: Map<string, Array<{ payload: unknown; timestamp: Date }>> = new Map();
  private readonly historyLimit = 100;

  /**
   * Subscribe to a topic
   */
  subscribe<K extends keyof MessagePayloads>(
    topic: K,
    handler: SubscriptionHandler<MessagePayloads[K]>
  ): () => void {
    // Topic is already in snake_case format (keyof MessagePayloads)
    const topicKey = topic as string;
    
    if (!this.subscriptions.has(topicKey)) {
      this.subscriptions.set(topicKey, new Set());
    }

    this.subscriptions.get(topicKey)!.add(handler as SubscriptionHandler<unknown>);
    console.log(`[MessageBus] Subscribed to ${topicKey}`);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(topicKey)?.delete(handler as SubscriptionHandler<unknown>);
      console.log(`[MessageBus] Unsubscribed from ${topicKey}`);
    };
  }

  /**
   * Publish a message to a topic
   */
  async publish<K extends keyof MessagePayloads>(
    topic: K,
    payload: MessagePayloads[K]
  ): Promise<void> {
    // Topic is already in snake_case format (keyof MessagePayloads)
    const topicKey = topic as string;
    
    console.log(`[MessageBus] Publishing to ${topicKey}`);

    // Store in history
    if (!this.messageHistory.has(topicKey)) {
      this.messageHistory.set(topicKey, []);
    }
    const history = this.messageHistory.get(topicKey)!;
    history.push({ payload, timestamp: new Date() });
    
    // Trim history
    if (history.length > this.historyLimit) {
      history.shift();
    }

    // Notify subscribers
    const handlers = this.subscriptions.get(topicKey);
    if (!handlers || handlers.size === 0) {
      console.log(`[MessageBus] No subscribers for ${topicKey}`);
      return;
    }

    const promises = Array.from(handlers).map(async (handler) => {
      try {
        await handler(payload);
      } catch (error) {
        console.error(`[MessageBus] Handler error for ${topicKey}:`, error);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get recent messages for a topic
   */
  getHistory<K extends keyof MessagePayloads>(
    topic: K,
    limit: number = 10
  ): Array<{ payload: MessagePayloads[K]; timestamp: Date }> {
    const topicKey = topic as string;
    const history = this.messageHistory.get(topicKey) || [];
    return history.slice(-limit) as Array<{ payload: MessagePayloads[K]; timestamp: Date }>;
  }

  /**
   * Clear subscriptions (for testing)
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Get subscription count for a topic
   */
  getSubscriberCount(topic: keyof MessagePayloads): number {
    const topicKey = topic as string;
    return this.subscriptions.get(topicKey)?.size || 0;
  }
}

/**
 * Singleton message bus instance
 */
export const messageBus = new InMemoryMessageBus();

// ============================================================================
// Agent Data Sharing Protocols
// ============================================================================

/**
 * Shared context that agents can read/write
 */
interface SharedAgentContext {
  user_id: string;
  data: Map<string, unknown>;
  metadata: Map<string, { agent: string; timestamp: Date }>;
}

const sharedContexts: Map<string, SharedAgentContext> = new Map();

/**
 * Get or create shared context for a user
 */
export function getSharedContext(userId: string): SharedAgentContext {
  if (!sharedContexts.has(userId)) {
    sharedContexts.set(userId, {
      user_id: userId,
      data: new Map(),
      metadata: new Map(),
    });
  }
  return sharedContexts.get(userId)!;
}

/**
 * Share data between agents
 */
export function shareData(
  userId: string,
  key: string,
  value: unknown,
  sourceAgent: string
): void {
  const context = getSharedContext(userId);
  context.data.set(key, value);
  context.metadata.set(key, {
    agent: sourceAgent,
    timestamp: new Date(),
  });
  console.log(`[SharedContext] ${sourceAgent} shared ${key} for user ${userId}`);
}

/**
 * Read shared data
 */
export function readSharedData<T>(userId: string, key: string): T | undefined {
  const context = getSharedContext(userId);
  return context.data.get(key) as T | undefined;
}

/**
 * Read shared data with metadata
 */
export function readSharedDataWithMeta<T>(
  userId: string,
  key: string
): { value: T | undefined; agent?: string; timestamp?: Date } {
  const context = getSharedContext(userId);
  const value = context.data.get(key) as T | undefined;
  const meta = context.metadata.get(key);
  return {
    value,
    agent: meta?.agent,
    timestamp: meta?.timestamp,
  };
}

/**
 * List all shared data keys for a user
 */
export function listSharedDataKeys(userId: string): string[] {
  const context = getSharedContext(userId);
  return Array.from(context.data.keys());
}

/**
 * Clear shared context for a user
 */
export function clearSharedContext(userId: string): void {
  sharedContexts.delete(userId);
}

// ============================================================================
// Agent Request/Response Protocol
// ============================================================================

interface AgentRequest<T = unknown> {
  id: string;
  from_agent: string;
  to_agent: string;
  action: string;
  params: T;
  timeout_ms: number;
  created_at: Date;
}

interface AgentResponse<T = unknown> {
  request_id: string;
  from_agent: string;
  success: boolean;
  data?: T;
  error?: string;
  responded_at: Date;
}

type RequestHandler<P, R> = (params: P) => Promise<R>;

const requestHandlers: Map<string, Map<string, RequestHandler<unknown, unknown>>> = new Map();
const pendingRequests: Map<string, {
  resolve: (response: AgentResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}> = new Map();

/**
 * Register a request handler for an agent
 */
export function registerRequestHandler<P, R>(
  agentId: string,
  action: string,
  handler: RequestHandler<P, R>
): void {
  if (!requestHandlers.has(agentId)) {
    requestHandlers.set(agentId, new Map());
  }
  requestHandlers.get(agentId)!.set(action, handler as RequestHandler<unknown, unknown>);
  console.log(`[AgentProtocol] Registered handler: ${agentId}.${action}`);
}

/**
 * Send a request to another agent
 */
export async function requestFromAgent<P, R>(
  fromAgent: string,
  toAgent: string,
  action: string,
  params: P,
  timeoutMs: number = 30000
): Promise<R> {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const request: AgentRequest<P> = {
    id: requestId,
    from_agent: fromAgent,
    to_agent: toAgent,
    action,
    params,
    timeout_ms: timeoutMs,
    created_at: new Date(),
  };

  console.log(`[AgentProtocol] ${fromAgent} -> ${toAgent}.${action}`);

  // Check if handler exists
  const agentHandlers = requestHandlers.get(toAgent);
  const handler = agentHandlers?.get(action);

  if (!handler) {
    throw new Error(`No handler registered for ${toAgent}.${action}`);
  }

  // Execute handler with timeout
  return new Promise<R>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Execute handler
    handler(params)
      .then((result) => {
        clearTimeout(timeout);
        resolve(result as R);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

/**
 * Broadcast a request to multiple agents
 */
export async function broadcastRequest<P, R>(
  fromAgent: string,
  toAgents: string[],
  action: string,
  params: P,
  timeoutMs: number = 30000
): Promise<Map<string, R | Error>> {
  const results = new Map<string, R | Error>();

  const promises = toAgents.map(async (toAgent) => {
    try {
      const result = await requestFromAgent<P, R>(
        fromAgent,
        toAgent,
        action,
        params,
        timeoutMs
      );
      results.set(toAgent, result);
    } catch (error) {
      results.set(toAgent, error as Error);
    }
  });

  await Promise.all(promises);
  return results;
}
