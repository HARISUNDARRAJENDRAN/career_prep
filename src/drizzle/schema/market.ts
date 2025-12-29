import {
  pgTable,
  varchar,
  text,
  decimal,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jobApplications } from './jobs';

// Enums for market domain
export const jobSourceEnum = pgEnum('job_source', [
  'jooble',
  'adzuna',
  'linkedin',
]);

export const feedbackTypeEnum = pgEnum('feedback_type', [
  'rejection',
  'ghosted',
  'interview_feedback',
]);

export const rejectionReasonEnum = pgEnum('rejection_reason', [
  'skills_gap',
  'experience_mismatch',
  'culture_fit',
  'unknown',
]);

export const trendDirectionEnum = pgEnum('trend_direction', [
  'rising',
  'stable',
  'declining',
]);

// Scraped job listings with expiration for automatic cleanup
export const jobListings = pgTable(
  'job_listings',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Source tracking
    source: jobSourceEnum('source').notNull(),
    external_id: varchar('external_id', { length: 255 }).notNull(), // Unique per source

    // Job details (summary columns for quick queries)
    title: varchar('title', { length: 255 }).notNull(),
    company: varchar('company', { length: 255 }).notNull(),
    location: varchar('location', { length: 255 }),
    salary_range: varchar('salary_range', { length: 100 }), // e.g., "$80k-$120k"

    // Skills required (for matching)
    skills_required: text('skills_required').array(),

    // Market freshness - automates stale data cleanup
    scraped_at: timestamp('scraped_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at').notNull(), // Default: scraped_at + 7 days

    // Raw intelligence from scraper
    raw_data: jsonb('raw_data').$type<{
      description?: string;
      requirements?: string[];
      benefits?: string[];
      application_url?: string;
      posted_date?: string;
      source_metadata?: Record<string, unknown>;
    }>(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Prevent duplicate scrapes from the same source
    uniqueIndex('job_listings_source_external_id_idx').on(
      table.source,
      table.external_id
    ),
  ]
);

// Aggregated market trends by skill/role
export const marketInsights = pgTable('market_insights', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // What this insight is about
  skill_name: varchar('skill_name', { length: 100 }).notNull(),
  role_category: varchar('role_category', { length: 100 }), // e.g., 'Backend', 'Frontend'

  // Summary metrics
  demand_score: decimal('demand_score', { precision: 4, scale: 2 }),
  trend_direction: trendDirectionEnum('trend_direction'),
  job_count: decimal('job_count', { precision: 10, scale: 0 }), // Number of listings with this skill

  // Raw intelligence for deep analysis
  raw_data: jsonb('raw_data').$type<{
    historical_data?: Array<{
      date: string;
      demand_score: number;
      job_count: number;
    }>;
    source_breakdown?: Record<string, number>; // e.g., { jooble: 150, adzuna: 200 }
    salary_correlation?: {
      average: number;
      min: number;
      max: number;
    };
    related_skills?: string[];
  }>(),

  // Timestamps
  analyzed_at: timestamp('analyzed_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Closed-loop rejection parsing for Strategist Agent
export const applicationFeedback = pgTable('application_feedback', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Critical link to job application
  job_application_id: varchar('job_application_id', { length: 36 })
    .notNull()
    .references(() => jobApplications.id, { onDelete: 'cascade' }),

  // Feedback classification
  feedback_type: feedbackTypeEnum('feedback_type').notNull(),
  rejection_reason_category: rejectionReasonEnum('rejection_reason_category'),

  // Identified skill gaps (for roadmap re-pathing)
  identified_gaps: text('identified_gaps').array(), // e.g., ['AWS', 'Kubernetes']

  // Raw intelligence for Strategist Agent
  raw_data: jsonb('raw_data').$type<{
    email_content?: string;
    parsed_entities?: string[];
    sentiment_score?: number;
    agent_analysis?: string;
    suggested_actions?: string[];
  }>(),

  // Timestamps
  received_at: timestamp('received_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// TypeScript types
export type JobListing = typeof jobListings.$inferSelect;
export type NewJobListing = typeof jobListings.$inferInsert;
export type MarketInsight = typeof marketInsights.$inferSelect;
export type NewMarketInsight = typeof marketInsights.$inferInsert;
export type ApplicationFeedback = typeof applicationFeedback.$inferSelect;
export type NewApplicationFeedback = typeof applicationFeedback.$inferInsert;

