/**
 * Credentials Service
 *
 * High-level service for managing encrypted platform credentials.
 * Provides CRUD operations with automatic encryption/decryption.
 *
 * @see docs/agentic-improvements/PHASE_6_AUTORESUME_PLAN.md - Milestone 3
 */

import { db } from '@/drizzle/db';
import {
  encryptedCredentials,
  credentialAuditLog,
  type CredentialPlatform,
  type CredentialStatus,
  type EncryptedCredential,
} from '@/drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  encrypt,
  decrypt,
  decryptCookies,
  encryptCookies,
  validateEncryptedFormat,
  type PlatformCookies,
} from './encryption';

// ============================================================================
// Types
// ============================================================================

export interface StoredCredential {
  id: string;
  platform: CredentialPlatform;
  accountIdentifier: string | null;
  status: CredentialStatus;
  statusMessage: string | null;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CredentialWithCookies extends StoredCredential {
  cookies: PlatformCookies;
}

// ============================================================================
// Audit Logging
// ============================================================================

async function logAudit(
  credentialId: string,
  userId: string,
  action: string,
  context?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await db.insert(credentialAuditLog).values({
    credential_id: credentialId,
    user_id: userId,
    action,
    context,
    ip_address: ipAddress,
    user_agent: userAgent,
  });
}

// ============================================================================
// CRUD Operations
// ============================================================================

/**
 * Stores encrypted credentials for a platform
 */
export async function storeCredentials(
  userId: string,
  platform: CredentialPlatform,
  cookies: PlatformCookies,
  accountIdentifier?: string,
  expiresAt?: Date
): Promise<StoredCredential> {
  // Encrypt the cookies
  const encryptedData = encryptCookies(cookies);

  // Check if credentials already exist for this user+platform
  const existing = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  let credential: EncryptedCredential;

  if (existing) {
    // Update existing credentials
    const [updated] = await db
      .update(encryptedCredentials)
      .set({
        encrypted_data: encryptedData,
        account_identifier: accountIdentifier,
        status: 'active',
        status_message: null,
        expires_at: expiresAt,
        updated_at: new Date(),
      })
      .where(eq(encryptedCredentials.id, existing.id))
      .returning();

    credential = updated;

    await logAudit(credential.id, userId, 'updated', `Platform: ${platform}`);
  } else {
    // Insert new credentials
    const [inserted] = await db
      .insert(encryptedCredentials)
      .values({
        user_id: userId,
        platform,
        encrypted_data: encryptedData,
        account_identifier: accountIdentifier,
        status: 'active',
        expires_at: expiresAt,
      })
      .returning();

    credential = inserted;

    await logAudit(credential.id, userId, 'created', `Platform: ${platform}`);
  }

  return mapCredential(credential);
}

/**
 * Retrieves credentials for a platform (without decryption)
 */
export async function getCredential(
  userId: string,
  platform: CredentialPlatform
): Promise<StoredCredential | null> {
  const credential = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  if (!credential) {
    return null;
  }

  return mapCredential(credential);
}

/**
 * Retrieves and decrypts credentials for a platform
 */
export async function getDecryptedCredentials(
  userId: string,
  platform: CredentialPlatform,
  context?: string
): Promise<CredentialWithCookies | null> {
  const credential = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  if (!credential) {
    return null;
  }

  // Check status
  if (credential.status !== 'active') {
    throw new Error(
      `Credentials for ${platform} are ${credential.status}: ${credential.status_message || 'No details'}`
    );
  }

  // Decrypt cookies
  const cookies = decryptCookies(credential.encrypted_data);

  // Update last used timestamp
  await db
    .update(encryptedCredentials)
    .set({
      last_used_at: new Date(),
      usage_count: String(parseInt(credential.usage_count || '0', 10) + 1),
    })
    .where(eq(encryptedCredentials.id, credential.id));

  // Log access
  await logAudit(credential.id, userId, 'accessed', context);

  return {
    ...mapCredential(credential),
    cookies,
  };
}

/**
 * Lists all credentials for a user (without decryption)
 */
export async function listCredentials(
  userId: string
): Promise<StoredCredential[]> {
  const credentials = await db.query.encryptedCredentials.findMany({
    where: eq(encryptedCredentials.user_id, userId),
    orderBy: (creds, { desc }) => [desc(creds.updated_at)],
  });

  return credentials.map(mapCredential);
}

/**
 * Updates credential status
 */
export async function updateCredentialStatus(
  userId: string,
  platform: CredentialPlatform,
  status: CredentialStatus,
  statusMessage?: string
): Promise<void> {
  const credential = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  if (!credential) {
    throw new Error(`No credentials found for ${platform}`);
  }

  await db
    .update(encryptedCredentials)
    .set({
      status,
      status_message: statusMessage,
      updated_at: new Date(),
      ...(status === 'active' ? { last_validated_at: new Date() } : {}),
    })
    .where(eq(encryptedCredentials.id, credential.id));

  await logAudit(
    credential.id,
    userId,
    status === 'active' ? 'validated' : 'status_changed',
    `Status: ${status}${statusMessage ? ` - ${statusMessage}` : ''}`
  );
}

/**
 * Records a validation failure
 */
export async function recordValidationFailure(
  userId: string,
  platform: CredentialPlatform,
  errorMessage: string
): Promise<void> {
  const credential = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  if (!credential) {
    return;
  }

  const failures = parseInt(credential.validation_failures || '0', 10) + 1;

  // After 3 failures, mark as invalid
  const newStatus: CredentialStatus = failures >= 3 ? 'invalid' : credential.status;

  await db
    .update(encryptedCredentials)
    .set({
      validation_failures: String(failures),
      status: newStatus,
      status_message: errorMessage,
      updated_at: new Date(),
    })
    .where(eq(encryptedCredentials.id, credential.id));

  await logAudit(
    credential.id,
    userId,
    'failed',
    `Failure ${failures}: ${errorMessage}`
  );
}

/**
 * Deletes credentials for a platform
 */
export async function deleteCredentials(
  userId: string,
  platform: CredentialPlatform
): Promise<boolean> {
  const credential = await db.query.encryptedCredentials.findFirst({
    where: and(
      eq(encryptedCredentials.user_id, userId),
      eq(encryptedCredentials.platform, platform)
    ),
  });

  if (!credential) {
    return false;
  }

  // Log before deletion (audit log will cascade delete)
  await logAudit(credential.id, userId, 'deleted', `Platform: ${platform}`);

  await db
    .delete(encryptedCredentials)
    .where(eq(encryptedCredentials.id, credential.id));

  return true;
}

/**
 * Disconnects (revokes) credentials without deleting them
 */
export async function revokeCredentials(
  userId: string,
  platform: CredentialPlatform
): Promise<void> {
  await updateCredentialStatus(userId, platform, 'revoked', 'Manually disconnected by user');
}

// ============================================================================
// Helpers
// ============================================================================

function mapCredential(credential: EncryptedCredential): StoredCredential {
  return {
    id: credential.id,
    platform: credential.platform,
    accountIdentifier: credential.account_identifier,
    status: credential.status,
    statusMessage: credential.status_message,
    lastValidatedAt: credential.last_validated_at,
    lastUsedAt: credential.last_used_at,
    expiresAt: credential.expires_at,
    createdAt: credential.created_at,
    updatedAt: credential.updated_at,
  };
}

// ============================================================================
// Platform-Specific Helpers
// ============================================================================

/**
 * Gets credentials formatted for the Python service
 */
export async function getCredentialsForPythonService(
  userId: string,
  platform: CredentialPlatform
): Promise<{
  cookies: Record<string, string>;
  userAgent?: string;
} | null> {
  const creds = await getDecryptedCredentials(
    userId,
    platform,
    'Python service request'
  );

  if (!creds) {
    return null;
  }

  // Convert cookie array to simple key-value object
  const cookieMap: Record<string, string> = {};
  for (const cookie of creds.cookies.cookies) {
    cookieMap[cookie.name] = cookie.value;
  }

  return {
    cookies: cookieMap,
    userAgent: creds.cookies.userAgent,
  };
}
