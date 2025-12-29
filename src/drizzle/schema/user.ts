import { pgTable, text, timestamp, varchar, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  // Primary identifier from Clerk
  clerk_id: varchar('clerk_id', { length: 255 }).primaryKey(),

  // Basic info synced from Clerk
  email: varchar('email', { length: 255 }).notNull().unique(),
  first_name: varchar('first_name', { length: 100 }),
  last_name: varchar('last_name', { length: 100 }),
  image_url: text('image_url'),

  // Public profile username (for Digital Twin)
  username: varchar('username', { length: 50 }).unique(),

  // Onboarding status
  onboarding_completed: boolean('onboarding_completed').default(false).notNull(),
  // Step-by-step persistence: 0=welcome, 1=career goals, 2=experience, 3=education, 4=work history, 5=complete
  onboarding_step: integer('onboarding_step').default(0).notNull(),

  // Timestamps
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// TypeScript types inferred from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

