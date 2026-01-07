"""
AES-256-GCM Encryption/Decryption Service for Python
Matches Node.js encryption format: version:salt:iv:authTag:ciphertext
"""

import base64
import hashlib
import json
import os
from typing import Dict, Any
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


# Constants matching Node.js implementation
ALGORITHM = 'aes-256-gcm'
IV_LENGTH = 16
AUTH_TAG_LENGTH = 16
KEY_LENGTH = 32
SALT_LENGTH = 32
PBKDF2_ITERATIONS = 100000
CURRENT_VERSION = 'v1'


class EncryptionError(Exception):
    """Raised when encryption/decryption operations fail"""
    pass


def _derive_key(password: str, salt: bytes) -> bytes:
    """
    Derive encryption key from password using PBKDF2
    Matches Node.js crypto.pbkdf2Sync implementation
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LENGTH,
        salt=salt,
        iterations=PBKDF2_ITERATIONS,
        backend=default_backend()
    )
    return kdf.derive(password.encode('utf-8'))


def decrypt(encrypted_payload: str, encryption_secret: str = None) -> str:
    """
    Decrypt AES-256-GCM encrypted data

    Args:
        encrypted_payload: Format "version:salt:iv:authTag:ciphertext" (all base64)
        encryption_secret: Secret key (from environment if not provided)

    Returns:
        Decrypted plaintext string

    Raises:
        EncryptionError: If decryption fails or format is invalid
    """
    if encryption_secret is None:
        encryption_secret = os.getenv('ENCRYPTION_SECRET')
        if not encryption_secret:
            raise EncryptionError("ENCRYPTION_SECRET environment variable not set")

    try:
        # Parse the encrypted payload
        parts = encrypted_payload.split(':')
        if len(parts) != 5:
            raise EncryptionError(
                f"Invalid encrypted payload format. Expected 5 parts, got {len(parts)}"
            )

        version, salt_b64, iv_b64, auth_tag_b64, ciphertext_b64 = parts

        # Validate version
        if version != CURRENT_VERSION:
            raise EncryptionError(f"Unsupported encryption version: {version}")

        # Decode base64 components
        salt = base64.b64decode(salt_b64)
        iv = base64.b64decode(iv_b64)
        auth_tag = base64.b64decode(auth_tag_b64)
        ciphertext = base64.b64decode(ciphertext_b64)

        # Validate lengths
        if len(salt) != SALT_LENGTH:
            raise EncryptionError(f"Invalid salt length: {len(salt)}")
        if len(iv) != IV_LENGTH:
            raise EncryptionError(f"Invalid IV length: {len(iv)}")
        if len(auth_tag) != AUTH_TAG_LENGTH:
            raise EncryptionError(f"Invalid auth tag length: {len(auth_tag)}")

        # Derive key from password and salt
        key = _derive_key(encryption_secret, salt)

        # Create cipher and decrypt
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv, auth_tag),
            backend=default_backend()
        )
        decryptor = cipher.decryptor()

        plaintext = decryptor.update(ciphertext) + decryptor.finalize()

        return plaintext.decode('utf-8')

    except Exception as e:
        if isinstance(e, EncryptionError):
            raise
        raise EncryptionError(f"Decryption failed: {str(e)}")


def decrypt_cookies(encrypted_payload: str, encryption_secret: str = None) -> Dict[str, Any]:
    """
    Decrypt platform cookies from encrypted payload

    Args:
        encrypted_payload: Encrypted cookies string from database
        encryption_secret: Secret key (from environment if not provided)

    Returns:
        Dictionary containing platform cookies

    Raises:
        EncryptionError: If decryption or JSON parsing fails
    """
    try:
        decrypted_json = decrypt(encrypted_payload, encryption_secret)
        cookies = json.loads(decrypted_json)

        if not isinstance(cookies, dict):
            raise EncryptionError("Decrypted cookies must be a JSON object")

        return cookies

    except json.JSONDecodeError as e:
        raise EncryptionError(f"Failed to parse decrypted cookies as JSON: {str(e)}")


def get_encryption_metadata() -> Dict[str, Any]:
    """
    Get encryption configuration metadata
    Useful for debugging and verification
    """
    return {
        'algorithm': ALGORITHM,
        'ivLength': IV_LENGTH,
        'authTagLength': AUTH_TAG_LENGTH,
        'keyLength': KEY_LENGTH,
        'saltLength': SALT_LENGTH,
        'pbkdf2Iterations': PBKDF2_ITERATIONS,
        'currentVersion': CURRENT_VERSION,
        'format': 'version:salt:iv:authTag:ciphertext'
    }


# Example usage and testing
if __name__ == '__main__':
    # Test decryption with a sample encrypted payload
    # This would typically come from the database
    test_secret = os.getenv('ENCRYPTION_SECRET', 'test-secret-key-minimum-32-chars!!')

    print("Encryption Metadata:")
    print(json.dumps(get_encryption_metadata(), indent=2))

    # Example of decrypting cookies
    # encrypted_payload = "v1:base64salt:base64iv:base64tag:base64ciphertext"
    # cookies = decrypt_cookies(encrypted_payload, test_secret)
    # print(f"Decrypted cookies: {cookies}")
