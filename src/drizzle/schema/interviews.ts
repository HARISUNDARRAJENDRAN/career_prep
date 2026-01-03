import {
  pgTable,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// Enums for interview domain
export const interviewTypeEnum = pgEnum('interview_type', [
  'reality_check',
  'weekly_sprint',
]);

export const interviewStatusEnum = pgEnum('interview_status', [
  'scheduled',
  'in_progress',
  'completed',
  'interrupted',
]);

export const interviews = pgTable('interviews', {
  // Primary key
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User relationship
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Hume AI session ID for reconnection if internet drops
  hume_session_id: varchar('hume_session_id', { length: 255 }).unique(),

  // Interview type and status
  type: interviewTypeEnum('type').notNull(),
  status: interviewStatusEnum('status').default('scheduled').notNull(),

  // Summary columns for quick queries
  duration_seconds: integer('duration_seconds'),
  overall_score: decimal('overall_score', { precision: 4, scale: 2 }),

  // Raw intelligence from Hume AI
  raw_data: jsonb('raw_data').$type<{
    transcript?: Array<{
      speaker: 'user' | 'agent';
      text: string;
      timestamp: string;
      emotions?: Record<string, number>;
    }>;
    emotion_summary?: Record<string, number>;
    confidence_scores?: Record<string, number>;
    hume_response?: Record<string, unknown>;
    // Analysis results from interview analyzer job
    analysis?: {
      skills_assessed: Array<{
        skill_name: string;
        claimed_level: string;
        verified_level: 'learning' | 'practicing' | 'proficient' | 'expert';
        confidence: number;
        evidence: string;
        gap_identified: boolean;
        recommendations: string[];
      }>;
      overall_notes: string;
      career_alignment_score: number;
      self_awareness_score: number;
      communication_score: number;
    };
  }>(),

  // Timestamps
  scheduled_at: timestamp('scheduled_at'),
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// TypeScript types inferred from schema
export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;

