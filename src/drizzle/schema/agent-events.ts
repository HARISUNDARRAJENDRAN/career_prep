import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  integer,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Agent Events Table
 *
 * Central audit log for all inter-agent communication.
 * Each event represents a message passed between agents via the message bus.
 *
 * Key Features:
 * - Idempotency: The `id` field serves as an idempotency key to prevent double-processing
 * - Priority Queuing: Events are routed to different queues based on priority (1-10)
 * - Audit Trail: All events are persisted for debugging and replay capability
 */

// Event processing status
export const eventStatusEnum = pgEnum('event_status', [
  'pending', // Event created, not yet dispatched
  'processing', // Event dispatched to background job
  'completed', // Job finished successfully
  'failed', // Job failed after all retries
]);

export const agentEvents = pgTable(
  'agent_events',
  {
    // Primary key - also used as Idempotency Key in job handlers
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Event identification
    event_type: varchar('event_type', { length: 50 }).notNull(),

    // Event payload (type-specific data)
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),

    // Processing status
    status: eventStatusEnum('status').default('pending').notNull(),

    // Priority for queue routing (1=lowest, 10=highest)
    // 10: User-facing, real-time (INTERVIEW_COMPLETED, SKILL_VERIFIED)
    // 7: User-triggered (ONBOARDING_COMPLETED, AUTO_APPLY_TRIGGERED)
    // 5: System-triggered (REJECTION_PARSED, ROADMAP_REPATH_NEEDED)
    // 3: Background processing (JOB_MATCH_FOUND, APPLICATION_SUBMITTED)
    // 1: Bulk operations (MARKET_UPDATE)
    priority: integer('priority').default(5).notNull(),

    // Agent routing
    source_agent: varchar('source_agent', { length: 50 }), // e.g., 'interviewer', 'sentinel'
    target_agent: varchar('target_agent', { length: 50 }), // e.g., 'architect', 'action'

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    processed_at: timestamp('processed_at'),

    // Error handling
    error_message: text('error_message'),
    retry_count: integer('retry_count').default(0).notNull(),
  },
  (table) => [
    // Index for finding pending/failed events to process
    index('idx_agent_events_status').on(table.status),

    // Index for filtering by event type
    index('idx_agent_events_type').on(table.event_type),

    // Index for time-based queries (audit trail)
    index('idx_agent_events_created').on(table.created_at),

    // Index for priority-based processing (high priority first, then oldest)
    index('idx_agent_events_priority').on(table.priority, table.created_at),

    // Composite index for finding events by source agent
    index('idx_agent_events_source').on(table.source_agent, table.created_at),
  ]
);

// Type exports for use in application code
export type AgentEvent = typeof agentEvents.$inferSelect;
export type NewAgentEvent = typeof agentEvents.$inferInsert;
