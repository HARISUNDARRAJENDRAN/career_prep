/**
 * Agent Memory Tables
 *
 * Implements three-tier memory system for autonomous agents:
 * - Working Memory: Current task context (cleared after execution)
 * - Episodic Memory: Past actions and outcomes (30 days retention)
 * - Long-term Memory: Validated knowledge (permanent with decay)
 *
 * Uses pgvector for semantic retrieval where appropriate.
 *
 * @see docs/agentic-improvements/04-AGENT_MEMORY_SYSTEM.md
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  real,
  integer,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// ============================================================================
// Enums
// ============================================================================

/**
 * Memory type enum
 */
export const memoryTypeEnum = pgEnum('memory_type', [
  'working',
  'episodic',
  'long_term',
]);

/**
 * Memory category for filtering and organization
 */
export const memoryCategoryEnum = pgEnum('memory_category', [
  'user_preference', // Learned user preferences
  'skill_assessment', // Skill verification results
  'interview_insight', // Insights from interviews
  'job_market_fact', // Job market observations
  'action_outcome', // Results of agent actions
  'feedback_received', // User or system feedback
  'pattern_learned', // Patterns detected across episodes
  'career_goal', // User's career objectives
  'company_info', // Company-specific knowledge
  'general_fact', // General domain knowledge
]);

/**
 * Agent name enum for scoping memory
 */
export const memoryAgentNameEnum = pgEnum('memory_agent_name', [
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
// Working Memory - Current Task Context
// ============================================================================

/**
 * Working Memory Table
 *
 * Holds current task context during agent execution.
 * Cleared after each execution completes.
 *
 * Size Limit: ~50KB per task
 * Lifetime: Single agent execution
 */
export const workingMemory = pgTable(
  'working_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Scoping
    agent_name: memoryAgentNameEnum('agent_name').notNull(),
    task_id: varchar('task_id', { length: 36 }).notNull(), // Trigger.dev run ID
    user_id: varchar('user_id', { length: 255 }).references(
      () => users.clerk_id,
      { onDelete: 'cascade' }
    ),

    // Content
    key: varchar('key', { length: 100 }).notNull(), // e.g., 'current_goal', 'active_plan', 'intermediate_result'
    value: jsonb('value').notNull().$type<Record<string, unknown>>(),

    // Metadata
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at'), // Auto-cleanup after this time
  },
  (table) => [
    // Fast lookup by task
    index('idx_working_memory_task').on(table.task_id),

    // Fast lookup by agent + task
    index('idx_working_memory_agent_task').on(table.agent_name, table.task_id),

    // Unique key per task
    uniqueIndex('idx_working_memory_unique_key').on(table.task_id, table.key),
  ]
);

// ============================================================================
// Episodic Memory - Past Actions and Outcomes
// ============================================================================

/**
 * Episodic Memory Table
 *
 * Records past agent actions and their outcomes for learning.
 * Used to inform future decisions and detect patterns.
 *
 * Size Limit: 1000 episodes per user per agent
 * Lifetime: 30 days default, extendable
 */
export const episodicMemory = pgTable(
  'episodic_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Scoping
    agent_name: memoryAgentNameEnum('agent_name').notNull(),
    user_id: varchar('user_id', { length: 255 }).references(
      () => users.clerk_id,
      { onDelete: 'cascade' }
    ),

    // Episode identification
    episode_type: varchar('episode_type', { length: 50 }).notNull(), // e.g., 'interview_analysis', 'job_match', 'roadmap_update'

    // What happened
    action_taken: text('action_taken').notNull(), // Description of action
    context: jsonb('context').$type<{
      trigger_event?: string;
      input_summary?: string;
      tools_used?: string[];
      plan_id?: string;
    }>(),

    // Outcome
    outcome: jsonb('outcome')
      .notNull()
      .$type<{
        success: boolean;
        result_summary: string;
        metrics?: Record<string, number>;
        artifacts_created?: string[];
      }>(),

    // Quality assessment
    confidence_score: real('confidence_score'), // 0.0 - 1.0
    user_feedback: jsonb('user_feedback').$type<{
      rating?: number;
      comment?: string;
      received_at?: string;
    }>(),

    // Retrieval metadata
    importance_score: real('importance_score').default(0.5), // For prioritizing in retrieval
    retrieval_count: integer('retrieval_count').default(0), // How often this memory is accessed

    // Vector for semantic search (optional, populated asynchronously)
    // Note: Using text field for embedding compatibility
    // In production, consider pgvector's vector type
    embedding_text: text('embedding_text'), // Text used to generate embedding

    // Timestamps
    occurred_at: timestamp('occurred_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at'), // Auto-cleanup after this time
    created_at: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by agent + user
    index('idx_episodic_memory_agent_user').on(table.agent_name, table.user_id),

    // Fast lookup by episode type
    index('idx_episodic_memory_type').on(table.episode_type),

    // Time-based queries
    index('idx_episodic_memory_occurred').on(table.occurred_at),

    // Priority retrieval (importance + recency)
    index('idx_episodic_memory_importance').on(
      table.importance_score,
      table.occurred_at
    ),
  ]
);

// ============================================================================
// Long-Term Memory - Validated Knowledge
// ============================================================================

/**
 * Long-Term Memory Table
 *
 * Stores validated, generalizable knowledge that persists.
 * Includes user preferences, domain facts, and learned patterns.
 *
 * Lifetime: Permanent with relevance decay
 */
export const longTermMemory = pgTable(
  'long_term_memory',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Scoping
    agent_name: memoryAgentNameEnum('agent_name'), // Null = global knowledge
    user_id: varchar('user_id', { length: 255 }).references(
      () => users.clerk_id,
      { onDelete: 'cascade' }
    ), // Null = system-wide fact

    // Memory categorization
    category: memoryCategoryEnum('category').notNull(),

    // Content
    fact: text('fact').notNull(), // The knowledge itself
    evidence: jsonb('evidence').$type<{
      source_episodes?: string[]; // Episode IDs that support this fact
      validation_method?: string;
      last_validated?: string;
      supporting_data?: Record<string, unknown>;
    }>(),

    // Confidence and validation
    confidence: real('confidence').default(0.5).notNull(), // 0.0 - 1.0
    validation_count: integer('validation_count').default(1), // Times this fact has been confirmed
    contradiction_count: integer('contradiction_count').default(0), // Times this fact has been contradicted

    // Relevance decay
    relevance_score: real('relevance_score').default(1.0), // Decays over time without reinforcement
    last_accessed_at: timestamp('last_accessed_at').defaultNow(),
    last_reinforced_at: timestamp('last_reinforced_at').defaultNow(),

    // Retrieval metadata
    retrieval_count: integer('retrieval_count').default(0),

    // Vector for semantic search
    embedding_text: text('embedding_text'), // Text used to generate embedding

    // Metadata
    metadata: jsonb('metadata').$type<{
      tags?: string[];
      related_facts?: string[];
      supersedes?: string; // ID of fact this one replaces
      superseded_by?: string; // ID of fact that replaced this one
    }>(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by user
    index('idx_long_term_memory_user').on(table.user_id),

    // Fast lookup by category
    index('idx_long_term_memory_category').on(table.category),

    // Fast lookup by agent + user
    index('idx_long_term_memory_agent_user').on(table.agent_name, table.user_id),

    // Relevance-based retrieval
    index('idx_long_term_memory_relevance').on(table.relevance_score),

    // Confidence-based retrieval
    index('idx_long_term_memory_confidence').on(table.confidence),
  ]
);

// ============================================================================
// Type Exports
// ============================================================================

export type WorkingMemory = typeof workingMemory.$inferSelect;
export type NewWorkingMemory = typeof workingMemory.$inferInsert;

export type EpisodicMemory = typeof episodicMemory.$inferSelect;
export type NewEpisodicMemory = typeof episodicMemory.$inferInsert;

export type LongTermMemory = typeof longTermMemory.$inferSelect;
export type NewLongTermMemory = typeof longTermMemory.$inferInsert;

export type MemoryType = (typeof memoryTypeEnum.enumValues)[number];
export type MemoryCategory = (typeof memoryCategoryEnum.enumValues)[number];
export type MemoryAgentName = (typeof memoryAgentNameEnum.enumValues)[number];
