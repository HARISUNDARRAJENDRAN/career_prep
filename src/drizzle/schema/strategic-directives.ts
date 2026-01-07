/**
 * Strategic Directives Schema
 *
 * Stores higher-level strategic decisions and directives from the Strategist Agent.
 * These directives guide the behavior of other agents (Resume, Action) over time.
 */

import { pgTable, varchar, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { users } from './user';
import { relations } from 'drizzle-orm';

// Directive types
export const directiveTypeEnum = pgEnum('directive_type', [
  'focus_shift',        // Change focus to different roles/industries
  'skill_priority',     // Prioritize learning/showcasing certain skills
  'application_strategy', // Change application approach (volume vs quality)
  'market_response',    // Response to market conditions
  'rejection_insight',  // Insight derived from rejections
  'ghosting_response',  // Response to ghosting pattern
  'success_pattern',    // Replicate successful application patterns
  'roadmap_adjustment', // Adjust learning roadmap
  'pause_applications', // Temporarily pause applications
  'resume_rewrite',     // Trigger major resume revision
  'other',
]);

// Directive priority
export const directivePriorityEnum = pgEnum('directive_priority', [
  'critical',  // Must be executed immediately
  'high',      // Should be executed within 24 hours
  'medium',    // Execute within a week
  'low',       // Execute when convenient
]);

// Directive status
export const directiveStatusEnum = pgEnum('directive_status', [
  'pending',    // Not yet started
  'active',     // Currently being executed
  'completed',  // Successfully executed
  'cancelled',  // Cancelled by user or system
  'failed',     // Failed to execute
  'superseded', // Replaced by newer directive
]);

/**
 * Strategic Directives Table
 *
 * Stores strategic decisions that guide agent behavior over time.
 */
export const strategicDirectives = pgTable('strategic_directives', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Directive metadata
  type: directiveTypeEnum('type').notNull(),
  priority: directivePriorityEnum('priority').default('medium').notNull(),
  status: directiveStatusEnum('status').default('pending').notNull(),

  // Directive content
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  reasoning: text('reasoning'), // Why this directive was issued

  // Execution details
  target_agent: varchar('target_agent', { length: 50 }), // Which agent should execute this
  action_required: text('action_required'), // Specific action to take

  // Metadata and context
  context: jsonb('context'), // Additional context (market data, rejection patterns, etc.)

  // Tracking
  issued_at: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  executed_at: timestamp('executed_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }), // Directive expiration

  // Results
  result: jsonb('result'), // Execution result/outcome
  impact_metrics: jsonb('impact_metrics'), // Measurable impact (e.g., response rate change)

  // Timestamps
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Directive Execution Log
 *
 * Tracks each execution attempt of a directive.
 */
export const directiveExecutionLog = pgTable('directive_execution_log', {
  id: varchar('id', { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  directive_id: varchar('directive_id', { length: 36 })
    .notNull()
    .references(() => strategicDirectives.id, { onDelete: 'cascade' }),

  // Execution details
  executed_by: varchar('executed_by', { length: 100 }).notNull(), // Agent that executed
  execution_status: varchar('execution_status', { length: 50 }).notNull(),

  // Logs
  logs: text('logs'),
  error_message: text('error_message'),

  // Metrics
  execution_time_ms: varchar('execution_time_ms', { length: 50 }),
  resources_used: jsonb('resources_used'),

  // Timestamps
  started_at: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completed_at: timestamp('completed_at', { withTimezone: true }),
});

// Relations
export const strategicDirectivesRelations = relations(strategicDirectives, ({ one, many }) => ({
  user: one(users, {
    fields: [strategicDirectives.user_id],
    references: [users.clerk_id],
  }),
  executionLogs: many(directiveExecutionLog),
}));

export const directiveExecutionLogRelations = relations(directiveExecutionLog, ({ one }) => ({
  directive: one(strategicDirectives, {
    fields: [directiveExecutionLog.directive_id],
    references: [strategicDirectives.id],
  }),
}));

// Types
export type StrategicDirective = typeof strategicDirectives.$inferSelect;
export type NewStrategicDirective = typeof strategicDirectives.$inferInsert;
export type DirectiveExecutionLog = typeof directiveExecutionLog.$inferSelect;
export type NewDirectiveExecutionLog = typeof directiveExecutionLog.$inferInsert;
