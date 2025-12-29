import {
  pgTable,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './user';

export const userProfiles = pgTable('user_profiles', {
  // Primary key
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // One-to-one relationship with users
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .unique()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Target roles for job matching (e.g., ['Backend Engineer', 'Full Stack Developer'])
  target_roles: text('target_roles').array(),

  // Preferred work locations (e.g., ['Remote', 'San Francisco', 'New York'])
  preferred_locations: text('preferred_locations').array(),

  // Salary expectations
  salary_expectation_min: integer('salary_expectation_min'),
  salary_expectation_max: integer('salary_expectation_max'),

  // Experience level
  years_of_experience: integer('years_of_experience'),

  // Flexible JSONB for complex nested data
  education: jsonb('education').$type<
    Array<{
      degree: string;
      institution: string;
      field_of_study?: string;
      start_date?: string;
      end_date?: string;
      gpa?: number;
    }>
  >(),

  work_history: jsonb('work_history').$type<
    Array<{
      title: string;
      company: string;
      location?: string;
      start_date: string;
      end_date?: string;
      description?: string;
      skills_used?: string[];
    }>
  >(),

  // Short professional summary
  bio: text('bio'),

  // Public profile visibility (for Digital Twin)
  is_public: boolean('is_public').default(false).notNull(),
  public_bio: text('public_bio'),

  // Resume storage
  resume_url: text('resume_url'),
  resume_filename: varchar('resume_filename', { length: 255 }),
  resume_text: text('resume_text'),
  resume_parsed_data: jsonb('resume_parsed_data').$type<{
    skills: string[];
    projects?: Array<{ title: string; description: string }>;
    certifications?: string[];
    languages?: string[];
  }>(),
  resume_uploaded_at: timestamp('resume_uploaded_at'),

  // Vector DB integration (for Phase 3.6 - RAG/Digital Twin)
  resume_is_embedded: boolean('resume_is_embedded').default(false).notNull(),
  resume_embedded_at: timestamp('resume_embedded_at'),
  resume_vector_metadata: jsonb('resume_vector_metadata').$type<{
    chunk_count?: number;
    embedding_model?: string;
    vector_ids?: string[];
    last_sync_hash?: string;
  }>(),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// TypeScript types inferred from schema
export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

