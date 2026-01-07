/**
 * Credential Encryption Service
 *
 * Provides AES-256-GCM encryption/decryption for secure storage of
 * platform credentials (cookies, tokens, etc.)
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption
 * - Unique IV per encryption operation
 * - Key derivation from environment secret using PBKDF2
 * - Constant-time comparison for authentication tags
 *
 * Format: version:iv:authTag:ciphertext (all base64 encoded)
 *
 * @see docs/agentic-improvements/PHASE_6_AUTORESUME_PLAN.md - Milestone 3
 */

import crypto from 'crypto';

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;
const CURRENT_VERSION = 'v1';

// ============================================================================
// Key Derivation
// ============================================================================

/**
 * Derives an encryption key from the master secret using PBKDF2
 */
function deriveKey(secret: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    secret,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Gets the master encryption secret from environment
 * @throws Error if ENCRYPTION_SECRET is not set
 */
function getMasterSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET environment variable is not set. ' +
        'Generate one with: openssl rand -base64 32'
    );
  }
  if (secret.length < 32) {
    throw new Error(
      'ENCRYPTION_SECRET must be at least 32 characters long for security'
    );
  }
  return secret;
}

// ============================================================================
// Encryption
// ============================================================================

export interface EncryptedPayload {
  version: string;
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

/**
 * Encrypts sensitive data using AES-256-GCM
 *
 * @param plaintext - The data to encrypt (object will be JSON stringified)
 * @returns Encrypted payload as a formatted string
 */
export function encrypt(plaintext: string | object): string {
  const secret = getMasterSecret();

  // Generate random salt and IV
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive key from secret + salt
  const key = deriveKey(secret, salt);

  // Convert plaintext to string if object
  const plaintextStr =
    typeof plaintext === 'object' ? JSON.stringify(plaintext) : plaintext;

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintextStr, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Format: version:salt:iv:authTag:ciphertext
  const payload: EncryptedPayload = {
    version: CURRENT_VERSION,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext,
  };

  return formatPayload(payload);
}

/**
 * Formats encrypted payload as a single string
 */
function formatPayload(payload: EncryptedPayload): string {
  return `${payload.version}:${payload.salt}:${payload.iv}:${payload.authTag}:${payload.ciphertext}`;
}

/**
 * Parses a formatted encrypted string back into payload components
 */
function parsePayload(encrypted: string): EncryptedPayload {
  const parts = encrypted.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted payload format');
  }

  return {
    version: parts[0],
    salt: parts[1],
    iv: parts[2],
    authTag: parts[3],
    ciphertext: parts[4],
  };
}

// ============================================================================
// Decryption
// ============================================================================

/**
 * Decrypts data that was encrypted with encrypt()
 *
 * @param encrypted - The encrypted payload string
 * @returns Decrypted plaintext
 * @throws Error if decryption fails (invalid key, tampered data, etc.)
 */
export function decrypt(encrypted: string): string {
  const secret = getMasterSecret();

  // Parse payload
  const payload = parsePayload(encrypted);

  // Validate version
  if (payload.version !== CURRENT_VERSION) {
    throw new Error(`Unsupported encryption version: ${payload.version}`);
  }

  // Decode base64 components
  const salt = Buffer.from(payload.salt, 'base64');
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  // Derive key from secret + salt
  const key = deriveKey(secret, salt);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  // Decrypt
  let plaintext = decipher.update(ciphertext);
  plaintext = Buffer.concat([plaintext, decipher.final()]);

  return plaintext.toString('utf8');
}

/**
 * Decrypts data and parses as JSON
 *
 * @param encrypted - The encrypted payload string
 * @returns Parsed JSON object
 */
export function decryptJson<T = unknown>(encrypted: string): T {
  const plaintext = decrypt(encrypted);
  return JSON.parse(plaintext) as T;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validates that decryption will work without actually decrypting
 * (checks format and version only)
 */
export function validateEncryptedFormat(encrypted: string): boolean {
  try {
    const payload = parsePayload(encrypted);
    return payload.version === CURRENT_VERSION;
  } catch {
    return false;
  }
}

/**
 * Re-encrypts data with a new salt/IV (for key rotation or refresh)
 */
export function reEncrypt(encrypted: string): string {
  const plaintext = decrypt(encrypted);
  return encrypt(plaintext);
}

/**
 * Generates a secure encryption secret for use in ENCRYPTION_SECRET
 */
export function generateSecret(): string {
  return crypto.randomBytes(32).toString('base64');
}

// ============================================================================
// Cookie-Specific Functions
// ============================================================================

export interface PlatformCookies {
  platform: string;
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  capturedAt: string;
  userAgent?: string;
}

/**
 * Encrypts platform cookies for storage
 */
export function encryptCookies(cookies: PlatformCookies): string {
  return encrypt(cookies);
}

/**
 * Decrypts platform cookies from storage
 */
export function decryptCookies(encrypted: string): PlatformCookies {
  return decryptJson<PlatformCookies>(encrypted);
}

// ============================================================================
// Export metadata for Python service compatibility
// ============================================================================

export const ENCRYPTION_METADATA = {
  algorithm: ALGORITHM,
  ivLength: IV_LENGTH,
  authTagLength: AUTH_TAG_LENGTH,
  keyLength: KEY_LENGTH,
  saltLength: SALT_LENGTH,
  pbkdf2Iterations: PBKDF2_ITERATIONS,
  currentVersion: CURRENT_VERSION,
  format: 'version:salt:iv:authTag:ciphertext',
} as const;
