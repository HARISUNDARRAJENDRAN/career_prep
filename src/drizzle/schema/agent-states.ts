/**
 * Agent States Table
 *
 * Tracks the current state of autonomous agents in the state machine.
 * Enables state persistence for crash recovery and debugging.
 *
 * @see docs/agentic-improvements/03-AGENT_STATE_MACHINE.md
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// ============================================================================
// Enums
// ============================================================================

/**
 * Agent state enum - all possible states an autonomous agent can be in
 */
export const agentStateEnum = pgEnum('agent_state', [
  'idle', // Not doing anything, waiting for trigger
  'initializing', // Loading context, preparing resources
  'planning', // Reasoning about what to do
  'executing', // Running a plan step
  'evaluating', // Assessing output quality
  'adapting', // Modifying plan based on evaluation
  'waiting_input', // Blocked on external input (user, API)
  'waiting_agent', // Blocked on another agent's completion
  'succeeded', // Completed successfully
  'failed', // Failed after exhausting retries
  'paused', // Manually paused by user/admin
  'cancelled', // Explicitly cancelled
]);

/**
 * Agent name enum for state ownership
 */
export const stateAgentNameEnum = pgEnum('state_agent_name', [
  'interviewer',
  'sentinel',
  'architect',
  'action',
  'strategist',
  'coordinator',
  'planner',
  'resume-architect',
]);

// ============================================================================
// Agent States Table
// ============================================================================

/**
 * Agent States Table
 *
 * Stores the current state of each agent instance.
 * One active state per agent + user + task combination.
 */
export const agentStates = pgTable(
  'agent_states',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Agent identification
    agent_name: stateAgentNameEnum('agent_name').notNull(),
    user_id: varchar('user_id', { length: 255 }).references(
      () => users.clerk_id,
      { onDelete: 'cascade' }
    ),
    task_id: varchar('task_id', { length: 36 }).notNull(), // Trigger.dev run ID

    // Current state
    current_state: agentStateEnum('current_state').default('idle').notNull(),
    previous_state: agentStateEnum('previous_state'),

    // State context
    state_context: jsonb('state_context').$type<{
      plan_id?: string;
      current_step_id?: string;
      iteration?: number;
      waiting_for?: {
        type: 'input' | 'agent' | 'api';
        identifier: string;
        timeout_at?: string;
      };
      last_error?: string;
      resume_data?: Record<string, unknown>; // Data needed to resume from paused state
    }>(),

    // Progress tracking
    total_transitions: integer('total_transitions').default(0),
    time_in_current_state_ms: integer('time_in_current_state_ms').default(0),

    // Timestamps
    state_entered_at: timestamp('state_entered_at').defaultNow().notNull(),
    last_transition_at: timestamp('last_transition_at').defaultNow().notNull(),
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // One active state per agent + user + task
    uniqueIndex('idx_agent_states_unique').on(
      table.agent_name,
      table.user_id,
      table.task_id
    ),

    // Fast lookup by task
    index('idx_agent_states_task').on(table.task_id),

    // Find agents in specific state
    index('idx_agent_states_state').on(table.current_state),

    // Find stuck agents (long time in state)
    index('idx_agent_states_entered').on(table.state_entered_at),
  ]
);

// ============================================================================
// Agent State Transitions Table
// ============================================================================

/**
 * Agent State Transitions Table
 *
 * Audit log of all state transitions for debugging and analysis.
 */
export const agentStateTransitions = pgTable(
  'agent_state_transitions',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Reference to agent state
    agent_state_id: varchar('agent_state_id', { length: 36 })
      .notNull()
      .references(() => agentStates.id, { onDelete: 'cascade' }),

    // Agent context (denormalized for faster queries)
    agent_name: stateAgentNameEnum('agent_name').notNull(),
    task_id: varchar('task_id', { length: 36 }).notNull(),

    // Transition details
    from_state: agentStateEnum('from_state').notNull(),
    to_state: agentStateEnum('to_state').notNull(),
    transition_event: varchar('transition_event', { length: 50 }).notNull(), // e.g., 'START', 'PLAN_COMPLETE', 'EVALUATION_PASS'

    // Event payload
    event_payload: jsonb('event_payload').$type<Record<string, unknown>>(),

    // Duration in previous state
    duration_ms: integer('duration_ms'),

    // Metadata
    metadata: jsonb('metadata').$type<{
      trigger?: string;
      validation_passed?: boolean;
      error?: string;
    }>(),

    // Timestamp
    transitioned_at: timestamp('transitioned_at').defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by agent state
    index('idx_transitions_state').on(table.agent_state_id),

    // Fast lookup by task (for debugging)
    index('idx_transitions_task').on(table.task_id),

    // Time-based queries (audit trail)
    index('idx_transitions_time').on(table.transitioned_at),

    // Find specific transition patterns
    index('idx_transitions_from_to').on(table.from_state, table.to_state),
  ]
);

// ============================================================================
// Agent Tool Usage Table
// ============================================================================

/**
 * Agent Tool Usage Table
 *
 * Tracks which tools agents use for analytics and optimization.
 */
export const agentToolUsage = pgTable(
  'agent_tool_usage',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Context
    agent_name: stateAgentNameEnum('agent_name').notNull(),
    task_id: varchar('task_id', { length: 36 }),
    plan_id: varchar('plan_id', { length: 36 }),
    step_id: varchar('step_id', { length: 36 }),

    // Tool details
    tool_id: varchar('tool_id', { length: 100 }).notNull(),
    tool_version: varchar('tool_version', { length: 20 }),

    // Execution details
    input_summary: text('input_summary'), // Truncated/summarized input
    input_size_bytes: integer('input_size_bytes'),

    // Result
    success: integer('success').notNull(), // 1 = success, 0 = failure (for aggregation)
    output_summary: text('output_summary'),
    error: text('error'),

    // Performance
    duration_ms: integer('duration_ms'),
    tokens_used: integer('tokens_used'),
    api_calls: integer('api_calls'),

    // Selection reasoning
    selection_reason: text('selection_reason'), // Why this tool was chosen
    alternatives_considered: jsonb('alternatives_considered').$type<string[]>(),

    // Timestamp
    executed_at: timestamp('executed_at').defaultNow().notNull(),
  },
  (table) => [
    // Analytics by tool
    index('idx_tool_usage_tool').on(table.tool_id),

    // Analytics by agent
    index('idx_tool_usage_agent').on(table.agent_name),

    // Time-based queries
    index('idx_tool_usage_time').on(table.executed_at),

    // Success rate analysis
    index('idx_tool_usage_success').on(table.tool_id, table.success),
  ]
);

// ============================================================================
// Type Exports
// ============================================================================

export type AgentStateRecord = typeof agentStates.$inferSelect;
export type NewAgentStateRecord = typeof agentStates.$inferInsert;

export type AgentStateTransition = typeof agentStateTransitions.$inferSelect;
export type NewAgentStateTransition = typeof agentStateTransitions.$inferInsert;

export type AgentToolUsage = typeof agentToolUsage.$inferSelect;
export type NewAgentToolUsage = typeof agentToolUsage.$inferInsert;

export type AgentState = (typeof agentStateEnum.enumValues)[number];
export type StateAgentName = (typeof stateAgentNameEnum.enumValues)[number];
