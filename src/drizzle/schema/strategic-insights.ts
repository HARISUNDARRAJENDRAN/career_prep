/**
 * Strategic Insights Schema
 *
 * Database tables for Strategist Agent data:
 * - Strategic insights and analyses
 * - Velocity metrics tracking
 * - Pattern detection history
 * - Intervention logs
 *
 * @see docs/agentic-improvements/09-STRATEGIST_AGENT.md
 */

import {
  pgTable,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// ============================================================================
// Enums
// ============================================================================

export const healthStatusEnum = pgEnum('health_status', [
  'excellent',
  'good',
  'needs_attention',
  'concerning',
]);

export const velocityLevelEnum = pgEnum('velocity_level', [
  'high',
  'medium',
  'low',
  'stalled',
]);

export const patternTypeEnum = pgEnum('pattern_type', [
  'skill_gap_cluster',
  'declining_trend',
  'milestone',
  'stall',
  'velocity_drop',
]);

export const patternSeverityEnum = pgEnum('pattern_severity', [
  'critical',
  'high',
  'medium',
  'low',
]);

export const interventionActionEnum = pgEnum('intervention_action', [
  'REPATH_ROADMAP',
  'NOTIFY_USER',
  'ADJUST_STRATEGY',
  'REQUEST_PRACTICE',
  'CELEBRATE',
  'NO_ACTION',
]);

export const interventionUrgencyEnum = pgEnum('intervention_urgency', [
  'immediate',
  'soon',
  'when_convenient',
]);

// ============================================================================
// Tables
// ============================================================================

/**
 * Strategic insights - comprehensive career health analyses
 */
export const strategicInsights = pgTable('strategic_insights', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User reference
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Health assessment
  health_score: integer('health_score').notNull(), // 0-100
  overall_health: healthStatusEnum('overall_health').notNull(),

  // Velocity metrics
  velocity_score: integer('velocity_score').notNull(), // 0-100
  velocity_level: velocityLevelEnum('velocity_level').notNull(),
  is_stalled: boolean('is_stalled').default(false).notNull(),
  days_inactive: integer('days_inactive'),

  // Summary
  executive_summary: text('executive_summary').notNull(),

  // Detailed data
  raw_data: jsonb('raw_data').$type<{
    patterns: Array<{
      type: string;
      severity: string;
      description: string;
      recommended_action?: string;
    }>;
    velocity_trends: {
      applications: { direction: string; change: number };
      interviews: { direction: string; change: number };
      progress: { direction: string; change: number };
    };
    recommendations: Array<{
      title: string;
      description: string;
      category: string;
      priority: number;
      expected_outcome: string;
      timeline?: string;
    }>;
    interventions: Array<{
      action: string;
      reason: string;
      urgency: string;
      payload?: Record<string, unknown>;
    }>;
    strengths: string[];
    improvement_areas: Array<{
      area: string;
      current_state: string;
      target_state: string;
      gap_severity: string;
    }>;
  }>(),

  // Trigger context
  trigger_event: varchar('trigger_event', { length: 100 }),

  // Analysis metadata
  analysis_duration_ms: integer('analysis_duration_ms'),
  confidence_score: decimal('confidence_score', { precision: 3, scale: 2 }),

  // Timestamps
  analyzed_at: timestamp('analyzed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Velocity metrics - time-series tracking of career velocity
 */
export const velocityMetrics = pgTable('velocity_metrics', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User reference
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Period tracking
  period_start: timestamp('period_start').notNull(),
  period_end: timestamp('period_end').notNull(),
  period_days: integer('period_days').notNull(),

  // Activity counts
  applications_count: integer('applications_count').default(0).notNull(),
  interviews_count: integer('interviews_count').default(0).notNull(),
  responses_received: integer('responses_received').default(0).notNull(),
  rejections_count: integer('rejections_count').default(0).notNull(),
  offers_count: integer('offers_count').default(0).notNull(),
  modules_completed: integer('modules_completed').default(0).notNull(),
  skills_verified: integer('skills_verified').default(0).notNull(),

  // Rates
  response_rate: decimal('response_rate', { precision: 5, scale: 2 }), // Percentage
  pass_rate: decimal('pass_rate', { precision: 5, scale: 2 }), // Percentage

  // Scores
  velocity_score: integer('velocity_score').notNull(), // 0-100
  velocity_level: velocityLevelEnum('velocity_level').notNull(),

  // Trends (compared to previous period)
  raw_data: jsonb('raw_data').$type<{
    trends: {
      applications: { direction: string; change_percentage: number; significance: string };
      interviews: { direction: string; change_percentage: number; significance: string };
      progress: { direction: string; change_percentage: number; significance: string };
    };
    recommendations: string[];
    previous_period?: {
      applications_count: number;
      interviews_count: number;
      modules_completed: number;
    };
  }>(),

  // Timestamps
  recorded_at: timestamp('recorded_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Pattern history - detected patterns over time
 */
export const patternHistory = pgTable('pattern_history', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User reference
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Pattern classification
  pattern_type: patternTypeEnum('pattern_type').notNull(),
  severity: patternSeverityEnum('severity').notNull(),
  description: text('description').notNull(),

  // Action taken
  recommended_action: varchar('recommended_action', { length: 100 }),
  action_taken: boolean('action_taken').default(false).notNull(),

  // Pattern data
  raw_data: jsonb('raw_data').$type<{
    // For skill_gap_cluster
    skill?: string;
    occurrences?: number;
    sources?: Array<{
      type: string;
      event_id: string;
      timestamp: string;
    }>;
    // For declining_trend
    metric?: string;
    data_points?: Array<{ date: string; value: number }>;
    change_percentage?: number;
    // For milestone
    milestone_type?: string;
    celebration_level?: string;
    metadata?: Record<string, unknown>;
    // For velocity_drop
    this_week?: number;
    last_week?: number;
  }>(),

  // Timestamps
  detected_at: timestamp('detected_at').defaultNow().notNull(),
  resolved_at: timestamp('resolved_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Intervention log - record of triggered interventions
 */
export const interventionLog = pgTable('intervention_log', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User reference
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Related pattern (optional)
  pattern_id: varchar('pattern_id', { length: 36 }),

  // Intervention details
  action: interventionActionEnum('action').notNull(),
  urgency: interventionUrgencyEnum('urgency').notNull(),
  reason: text('reason').notNull(),

  // Execution status
  executed: boolean('executed').default(false).notNull(),
  execution_result: varchar('execution_result', { length: 100 }),
  error_message: text('error_message'),

  // Payload data
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  // Timestamps
  triggered_at: timestamp('triggered_at').defaultNow().notNull(),
  executed_at: timestamp('executed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// ============================================================================
// TypeScript Types
// ============================================================================

export type StrategicInsight = typeof strategicInsights.$inferSelect;
export type NewStrategicInsight = typeof strategicInsights.$inferInsert;
export type VelocityMetric = typeof velocityMetrics.$inferSelect;
export type NewVelocityMetric = typeof velocityMetrics.$inferInsert;
export type PatternHistoryRecord = typeof patternHistory.$inferSelect;
export type NewPatternHistoryRecord = typeof patternHistory.$inferInsert;
export type InterventionLogRecord = typeof interventionLog.$inferSelect;
export type NewInterventionLogRecord = typeof interventionLog.$inferInsert;
