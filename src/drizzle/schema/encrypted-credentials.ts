/**
 * Encrypted Credentials Table
 *
 * Securely stores session cookies and authentication tokens for job platforms.
 * Used by the Action Agent to authenticate with LinkedIn, Indeed, etc.
 *
 * Security:
 * - All sensitive data is encrypted with AES-256-GCM before storage
 * - Encryption keys are derived from ENCRYPTION_SECRET env var
 * - IVs are unique per credential and stored alongside ciphertext
 *
 * @see docs/agentic-improvements/PHASE_6_AUTORESUME_PLAN.md - Milestone 3
 */

import {
  pgTable,
  varchar,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './user';

// ============================================================================
// Enums
// ============================================================================

/**
 * Supported job platforms for credential storage
 */
export const platformEnum = pgEnum('credential_platform', [
  'linkedin',
  'indeed',
  'glassdoor',
  'ziprecruiter',
  'dice',
  'monster',
  'careerbuilder',
  'angellist',
  'wellfound',
  'greenhouse',
  'lever',
  'workday',
  'gmail', // Email monitoring
  'other',
]);

/**
 * Credential status enum
 */
export const credentialStatusEnum = pgEnum('credential_status', [
  'active', // Credentials are valid and working
  'expired', // Session has expired, needs refresh
  'invalid', // Credentials failed validation
  'revoked', // User manually disconnected
  'pending', // Awaiting initial validation
]);

// ============================================================================
// Encrypted Credentials Table
// ============================================================================

/**
 * Encrypted Credentials Table
 *
 * Stores encrypted authentication data for job platforms.
 * One credential set per user per platform.
 */
export const encryptedCredentials = pgTable(
  'encrypted_credentials',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // User ownership
    user_id: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.clerk_id, { onDelete: 'cascade' }),

    // Platform identification
    platform: platformEnum('platform').notNull(),

    // Display name for the account (e.g., email or username used)
    account_identifier: varchar('account_identifier', { length: 255 }),

    // Encrypted session data (cookies, tokens)
    // Format: base64(iv):base64(authTag):base64(ciphertext)
    encrypted_data: text('encrypted_data').notNull(),

    // Encryption metadata
    encryption_version: varchar('encryption_version', { length: 10 })
      .default('v1')
      .notNull(),

    // Status tracking
    status: credentialStatusEnum('status').default('pending').notNull(),
    status_message: text('status_message'),

    // Validation tracking
    last_validated_at: timestamp('last_validated_at'),
    validation_failures: varchar('validation_failures', { length: 10 }).default(
      '0'
    ),

    // Usage tracking
    last_used_at: timestamp('last_used_at'),
    usage_count: varchar('usage_count', { length: 20 }).default('0'),

    // Expiration (for session cookies)
    expires_at: timestamp('expires_at'),

    // Timestamps
    created_at: timestamp('created_at').defaultNow().notNull(),
    updated_at: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    // One credential per user per platform
    uniqueIndex('idx_credentials_user_platform').on(
      table.user_id,
      table.platform
    ),

    // Fast lookup by user
    index('idx_credentials_user').on(table.user_id),

    // Find active credentials
    index('idx_credentials_status').on(table.status),

    // Find expiring credentials
    index('idx_credentials_expires').on(table.expires_at),
  ]
);

// ============================================================================
// Credential Audit Log Table
// ============================================================================

/**
 * Credential Audit Log Table
 *
 * Tracks all access and modifications to credentials for security auditing.
 */
export const credentialAuditLog = pgTable(
  'credential_audit_log',
  {
    id: varchar('id', { length: 36 })
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // Reference to credential
    credential_id: varchar('credential_id', { length: 36 })
      .notNull()
      .references(() => encryptedCredentials.id, { onDelete: 'cascade' }),

    // User who owns the credential
    user_id: varchar('user_id', { length: 255 }).notNull(),

    // Action performed
    action: varchar('action', { length: 50 }).notNull(), // 'created', 'accessed', 'updated', 'deleted', 'validated', 'failed'

    // Context
    context: text('context'), // Additional details (e.g., which agent accessed, job URL applied to)

    // Request metadata
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),

    // Timestamp
    performed_at: timestamp('performed_at').defaultNow().notNull(),
  },
  (table) => [
    // Fast lookup by credential
    index('idx_audit_credential').on(table.credential_id),

    // Fast lookup by user
    index('idx_audit_user').on(table.user_id),

    // Time-based queries
    index('idx_audit_time').on(table.performed_at),
  ]
);

// ============================================================================
// Type Exports
// ============================================================================

export type EncryptedCredential = typeof encryptedCredentials.$inferSelect;
export type NewEncryptedCredential = typeof encryptedCredentials.$inferInsert;

export type CredentialAuditLog = typeof credentialAuditLog.$inferSelect;
export type NewCredentialAuditLog = typeof credentialAuditLog.$inferInsert;

export type CredentialPlatform = (typeof platformEnum.enumValues)[number];
export type CredentialStatus = (typeof credentialStatusEnum.enumValues)[number];
