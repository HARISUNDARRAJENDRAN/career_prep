import {
  pgTable,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { interviews } from './interviews';

// Enums for skills domain
export const proficiencyLevelEnum = pgEnum('proficiency_level', [
  'learning',
  'practicing',
  'proficient',
  'expert',
]);

export const verificationTypeEnum = pgEnum('verification_type', [
  'live_coding',
  'concept_explanation',
  'project_demo',
]);

// Master skill catalog with market demand scores
export const skills = pgTable('skills', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Skill identification
  name: varchar('name', { length: 100 }).notNull().unique(),
  category: varchar('category', { length: 100 }), // e.g., 'Backend', 'Frontend', 'DevOps'
  description: text('description'),

  // Market demand score (updated by Sentinel Agent)
  demand_score: decimal('demand_score', { precision: 4, scale: 2 }),

  // Related skills and prerequisites
  metadata: jsonb('metadata').$type<{
    related_skills?: string[];
    prerequisites?: string[];
    learning_resources?: Array<{ title: string; url: string; type: string }>;
  }>(),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// User's skill proficiency with verification metadata
export const userSkills = pgTable(
  'user_skills',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Relationships
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.clerk_id, { onDelete: 'cascade' }),

    skill_id: varchar('skill_id', { length: 36 })
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),

    // Proficiency level
    proficiency_level: proficiencyLevelEnum('proficiency_level')
      .default('learning')
      .notNull(),

    // Verification metadata (replaces simple boolean)
    // Contains proof snippets for Digital Twin to show recruiters
    verification_metadata: jsonb('verification_metadata').$type<{
      is_verified: boolean;
      verification_count: number;
      // Source tracking
      source?: 'resume' | 'manual' | 'interview';
      claimed_at?: string;
      resume_claim_validated?: boolean | null;
      needs_interview_focus?: boolean;
      // Normalization metadata from resume parsing
      normalization_metadata?: {
        original_claim: string;
        normalized_to: string;
        confidence: number;
      };
      // Verification proof from interviews
      latest_proof?: {
        interview_id: string;
        timestamp: string;
        transcript_snippet: string;
        evaluator_confidence: number;
      };
      // Skill gap analysis (from interview analyzer)
      verified_level?: 'learning' | 'practicing' | 'proficient' | 'expert';
      gap_identified?: boolean;
      recommendations?: string[];
    }>(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // Prevent duplicate skill entries per user
    uniqueIndex('user_skills_user_id_skill_id_idx').on(
      table.user_id,
      table.skill_id
    ),
  ]
);

// Detailed verification log for each skill verification event
export const skillVerifications = pgTable('skill_verifications', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Relationships
  user_skill_id: varchar('user_skill_id', { length: 36 })
    .notNull()
    .references(() => userSkills.id, { onDelete: 'cascade' }),

  interview_id: varchar('interview_id', { length: 36 })
    .notNull()
    .references(() => interviews.id, { onDelete: 'cascade' }),

  // Verification details
  verification_type: verificationTypeEnum('verification_type').notNull(),
  summary: text('summary').notNull(), // e.g., "Successfully explained Middleware logic"

  // Raw intelligence for agent mining
  raw_data: jsonb('raw_data').$type<{
    transcript_snippet: string;
    evaluator_notes?: string;
    confidence_score: number;
    duration_seconds?: number;
  }>(),

  // Timestamps
  verified_at: timestamp('verified_at').defaultNow().notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
});

// TypeScript types
export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;
export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;
export type SkillVerification = typeof skillVerifications.$inferSelect;
export type NewSkillVerification = typeof skillVerifications.$inferInsert;

