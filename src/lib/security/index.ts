/**
 * Security Module
 *
 * Provides encryption and credential management services.
 */

export {
  encrypt,
  decrypt,
  decryptJson,
  encryptCookies,
  decryptCookies,
  validateEncryptedFormat,
  reEncrypt,
  generateSecret,
  ENCRYPTION_METADATA,
  type EncryptedPayload,
  type PlatformCookies,
} from './encryption';

export {
  storeCredentials,
  getCredential,
  getDecryptedCredentials,
  listCredentials,
  updateCredentialStatus,
  recordValidationFailure,
  deleteCredentials,
  revokeCredentials,
  getCredentialsForPythonService,
  type StoredCredential,
  type CredentialWithCookies,
} from './credentials-service';
