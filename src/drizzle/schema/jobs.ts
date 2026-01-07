import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { jobListings } from './market';

// Enums for job domain
export const documentTypeEnum = pgEnum('document_type', [
  'resume',
  'cover_letter',
]);

export const applicationStatusEnum = pgEnum('application_status', [
  'draft',
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'ghosted',
]);

// Versioned resumes and cover letters
export const applicationDocuments = pgTable('application_documents', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User relationship
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Document details
  type: documentTypeEnum('type').notNull(),
  version: integer('version').notNull().default(1), // Enables closed-loop tracking
  name: varchar('name', { length: 255 }), // e.g., "Backend Engineer Resume v2"

  // File storage reference
  file_url: varchar('file_url', { length: 500 }),

  // Document metadata for agent analysis
  metadata: jsonb('metadata').$type<{
    skills_highlighted?: string[];
    target_role?: string;
    ats_score?: number;
    word_count?: number;
    last_modified_by?: 'user' | 'agent';
  }>(),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Tracked job applications with links to listings and documents
export const jobApplications = pgTable('job_applications', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Relationships
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Link to scraped job listing (nullable for manual applications)
  job_listing_id: varchar('job_listing_id', { length: 36 }).references(
    () => jobListings.id,
    { onDelete: 'set null' }
  ),

  // Link to the document version used for this application
  document_id: varchar('document_id', { length: 36 }).references(
    () => applicationDocuments.id,
    { onDelete: 'set null' }
  ),

  // Denormalized for quick queries (in case job_listing expires)
  company: varchar('company', { length: 255 }).notNull(),
  role: varchar('role', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }),

  // Application status
  status: applicationStatusEnum('status').default('draft').notNull(),

  // Raw intelligence for agent mining
  raw_data: jsonb('raw_data').$type<{
    job_description?: string;
    match_score?: number;
    agent_reasoning?: string;
    email_threads?: Array<{
      date: string;
      from: string;
      subject: string;
      body: string;
    }>;
    interview_notes?: string;
    // Rejection tracking fields
    rejection_reason?: string;
    rejection_category?: 'experience' | 'skills' | 'cultural_fit' | 'competition' | 'timing' | 'other';
    rejection_feedback?: string;
    rejection_confidence?: number;
    rejection_parsed_at?: string;
    rejection_parsed?: boolean;
    rejection_type?: 'skill_gap' | 'experience_mismatch' | 'cultural_fit' | 'competition' | 'position_filled' | 'generic' | 'unknown' | 'standard_rejection' | 'after_interview' | 'ghosting' | 'auto_rejection' | 'other';
    skill_gaps?: Array<{ skill: string; importance: string; context?: string; suggestion?: string }>;
    parsed_at?: string;
    // Ghosting tracking fields
    ghosted_reason?: string;
    ghosted_at?: string;
    days_since_application?: number;
    // Resume/cover letter used
    resume_version?: string;
    cover_letter?: string;
    job_url?: string;
    // Sprint automation fields
    source?: 'weekly_sprint' | 'manual' | 'action_agent' | 'job_match' | string;
    created_by?: 'sprint_automation' | 'user' | 'agent' | string;
  }>(),

  // Timestamps
  applied_at: timestamp('applied_at'),
  last_activity_at: timestamp('last_activity_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// TypeScript types
export type ApplicationDocument = typeof applicationDocuments.$inferSelect;
export type NewApplicationDocument = typeof applicationDocuments.$inferInsert;
export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;

