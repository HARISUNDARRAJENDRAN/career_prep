import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  boolean,
} from 'drizzle-orm/pg-core';
import { users } from './user';
import { skills } from './skills';

// Enums for roadmap domain
export const roadmapStatusEnum = pgEnum('roadmap_status', [
  'active',
  'paused',
  'completed',
  'archived',
]);

export const moduleStatusEnum = pgEnum('module_status', [
  'locked',
  'available',
  'in_progress',
  'completed',
]);

// User-personalized learning roadmaps
export const roadmaps = pgTable('roadmaps', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // User relationship
  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // Roadmap details
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  target_role: varchar('target_role', { length: 100 }), // e.g., 'Backend Engineer'

  // Status and progress
  status: roadmapStatusEnum('status').default('active').notNull(),
  progress_percentage: integer('progress_percentage').default(0),

  // Architect Agent metadata
  metadata: jsonb('metadata').$type<{
    generated_by: 'architect_agent' | 'manual';
    market_alignment_score?: number;
    last_repathed_at?: string;
    repath_reason?: string;
  }>(),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Modular, interleaved learning units within a roadmap
export const roadmapModules = pgTable('roadmap_modules', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // Parent roadmap
  roadmap_id: varchar('roadmap_id', { length: 36 })
    .notNull()
    .references(() => roadmaps.id, { onDelete: 'cascade' }),

  // Module details
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  order_index: integer('order_index').notNull(), // Position in roadmap

  // Status and progress
  status: moduleStatusEnum('status').default('locked').notNull(),
  is_milestone: boolean('is_milestone').default(false),

  // Skills taught in this module
  skill_id: varchar('skill_id', { length: 36 }).references(() => skills.id, {
    onDelete: 'set null',
  }),

  // Learning content and resources
  content: jsonb('content').$type<{
    learning_objectives?: string[];
    resources?: Array<{
      title: string;
      url: string;
      type: 'video' | 'article' | 'course' | 'project';
      duration_minutes?: number;
    }>;
    practice_exercises?: Array<{
      title: string;
      description: string;
      difficulty: 'easy' | 'medium' | 'hard';
    }>;
  }>(),

  // Estimated time to complete (in hours)
  estimated_hours: integer('estimated_hours'),

  // Timestamps
  started_at: timestamp('started_at'),
  completed_at: timestamp('completed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// TypeScript types
export type Roadmap = typeof roadmaps.$inferSelect;
export type NewRoadmap = typeof roadmaps.$inferInsert;
export type RoadmapModule = typeof roadmapModules.$inferSelect;
export type NewRoadmapModule = typeof roadmapModules.$inferInsert;

