/**
 * Notifications Schema
 *
 * Stores user notifications for job alerts, market updates, and system messages.
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './user';

// Notification types
export const notificationTypeEnum = pgEnum('notification_type', [
  'job_match',        // New job match found
  'market_update',    // Market trends update
  'skill_verified',   // Skill verified from interview
  'interview_ready',  // Interview results available
  'roadmap_update',   // Roadmap re-pathing suggested
  'system',           // System announcements
]);

// Notification priority
export const notificationPriorityEnum = pgEnum('notification_priority', [
  'low',
  'normal',
  'high',
  'urgent',
]);

// User notifications table
export const notifications = pgTable(
  'notifications',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Who this notification is for
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.clerk_id, { onDelete: 'cascade' }),

    // Notification details
    type: notificationTypeEnum('type').notNull(),
    priority: notificationPriorityEnum('priority').default('normal').notNull(),

    // Display content
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),

    // Optional action link
    action_url: varchar('action_url', { length: 500 }),
    action_label: varchar('action_label', { length: 100 }),

    // Read/seen status
    is_read: boolean('is_read').default(false).notNull(),
    read_at: timestamp('read_at'),

    // Additional data for the notification
    metadata: jsonb('metadata').$type<{
      // Job match specific
      job_id?: string;
      job_title?: string;
      company?: string;
      match_score?: number;
      matching_skills?: string[];
      missing_skills?: string[];

      // Market update specific
      trending_skills?: string[];
      new_jobs_count?: number;

      // Skill verification specific
      skill_name?: string;
      proficiency_level?: string;

      // Generic
      source?: string;
      [key: string]: unknown;
    }>(),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    expires_at: timestamp('expires_at'), // Optional expiration for time-sensitive notifications
  },
  (table) => [
    // Index for fetching user notifications
    index('notifications_user_id_idx').on(table.user_id),
    // Index for unread notifications
    index('notifications_user_unread_idx').on(table.user_id, table.is_read),
    // Index for filtering by type
    index('notifications_type_idx').on(table.type),
  ]
);

// User notification preferences
export const notificationPreferences = pgTable('notification_preferences', {
  id: varchar('id', { length: 36 })
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  user_id: varchar('user_id', { length: 255 })
    .notNull()
    .unique()
    .references(() => users.clerk_id, { onDelete: 'cascade' }),

  // In-app notifications
  in_app_job_matches: boolean('in_app_job_matches').default(true).notNull(),
  in_app_market_updates: boolean('in_app_market_updates').default(true).notNull(),
  in_app_skill_verified: boolean('in_app_skill_verified').default(true).notNull(),
  in_app_roadmap_updates: boolean('in_app_roadmap_updates').default(true).notNull(),

  // Email notifications (future)
  email_job_matches: boolean('email_job_matches').default(false).notNull(),
  email_weekly_digest: boolean('email_weekly_digest').default(false).notNull(),

  // Thresholds
  job_match_min_score: varchar('job_match_min_score', { length: 10 }).default('60'), // Only notify for 60%+ matches

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.user_id],
    references: [users.clerk_id],
  }),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.user_id],
      references: [users.clerk_id],
    }),
  })
);
