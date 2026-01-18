import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto';

export interface CryptoConfig {
  algorithm?: string;
  keyLength?: number;
  ivLength?: number;
  saltLength?: number;
  iterations?: number;
  digest?: string;
}

export interface EncryptionOptions {
  key?: string;
  salt?: Buffer;
  encoding?: BufferEncoding;
}

export interface EncryptedData {
  encrypted: string;
  salt: string;
  iv: string;
  authTag?: string;
}

export class CryptoProvider {
  private readonly config: Required<CryptoConfig>;

  constructor(config: CryptoConfig = {}) {
    const algorithm = config.algorithm || 'aes-256-gcm';
    // ChaCha20-Poly1305 requires 12 byte IV
    const ivLength = algorithm === 'chacha20-poly1305' ? 12 : config.ivLength || 16;

    // Determine key length based on algorithm
    let keyLength = config.keyLength || 32;
    if (!config.keyLength) {
      if (algorithm.includes('128')) {
        keyLength = 16;
      } else if (algorithm.includes('192')) {
        keyLength = 24;
      } else if (algorithm.includes('256')) {
        keyLength = 32;
      }
    }

    this.config = {
      algorithm,
      keyLength,
      ivLength,
      saltLength: config.saltLength || 32,
      iterations: config.iterations || 100_000,
      digest: config.digest || 'sha256',
    };
  }

  private deriveKey(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(
      password,
      salt,
      this.config.iterations,
      this.config.keyLength,
      this.config.digest,
    );
  }

  encrypt(data: string, options: EncryptionOptions = {}): EncryptedData {
    const salt = options.salt || randomBytes(this.config.saltLength);
    const key = options.key
      ? Buffer.from(options.key, 'hex')
      : this.deriveKey(process.env['DB_BRIDGE_ENCRYPTION_KEY'] || 'default-key', salt);

    const iv = randomBytes(this.config.ivLength);
    const cipher = createCipheriv(this.config.algorithm, key, iv);

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const result: EncryptedData = {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
    };

    // For authenticated encryption modes (GCM, Poly1305), we need the auth tag
    if (this.config.algorithm.includes('gcm') || this.config.algorithm.includes('poly1305')) {
      result.authTag = (cipher as any).getAuthTag().toString('hex');
    }

    return result;
  }

  decrypt(encryptedData: EncryptedData, options: EncryptionOptions = {}): string {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = options.key
      ? Buffer.from(options.key, 'hex')
      : this.deriveKey(process.env['DB_BRIDGE_ENCRYPTION_KEY'] || 'default-key', salt);

    const iv = Buffer.from(encryptedData.iv, 'hex');
    const decipher = createDecipheriv(this.config.algorithm, key, iv);

    // For authenticated encryption modes (GCM, Poly1305), set the auth tag
    if (
      (this.config.algorithm.includes('gcm') || this.config.algorithm.includes('poly1305')) &&
      encryptedData.authTag
    ) {
      (decipher as any).setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    }

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Encrypt a value for storage in database
   */
  encryptField(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    const data = typeof value === 'string' ? value : JSON.stringify(value);
    const encrypted = this.encrypt(data);

    // Store as a single string in format: algorithm:salt:iv:authTag:encrypted
    return [
      this.config.algorithm,
      encrypted.salt,
      encrypted.iv,
      encrypted.authTag || '',
      encrypted.encrypted,
    ].join(':');
  }

  /**
   * Decrypt a value from database storage
   */
  decryptField(encryptedField: string): unknown {
    if (!encryptedField) {
      return null;
    }

    const parts = encryptedField.split(':');
    if (parts.length < 4) {
      throw new Error('Invalid encrypted field format');
    }

    const [algorithm, salt, iv, authTag, encrypted] = parts;

    // Verify algorithm matches
    if (algorithm !== this.config.algorithm) {
      throw new Error(`Algorithm mismatch: expected ${this.config.algorithm}, got ${algorithm}`);
    }

    const encryptedData: EncryptedData = {
      encrypted: encrypted!,
      salt: salt!,
      iv: iv!,
      authTag: authTag || undefined,
    };

    const decrypted = this.decrypt(encryptedData);

    // Try to parse as JSON, otherwise return as string
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  /**
   * Generate a random encryption key
   */
  generateKey(): string {
    return randomBytes(this.config.keyLength).toString('hex');
  }

  /**
   * Hash a value using SHA-256 (one-way)
   */
  hash(value: string): string {
    const hash = require('node:crypto').createHash('sha256');
    hash.update(value);
    return hash.digest('hex');
  }

  /**
   * Compare a plain value with a hashed value
   */
  compareHash(value: string, hash: string): boolean {
    return this.hash(value) === hash;
  }
}

// Export a default instance
export const crypto = new CryptoProvider();

// Export additional crypto algorithms
export const CryptoAlgorithms = {
  AES_256_GCM: 'aes-256-gcm',
  AES_256_CBC: 'aes-256-cbc',
  AES_192_GCM: 'aes-192-gcm',
  AES_192_CBC: 'aes-192-cbc',
  AES_128_GCM: 'aes-128-gcm',
  AES_128_CBC: 'aes-128-cbc',
  CHACHA20_POLY1305: 'chacha20-poly1305',
} as const;

export type CryptoAlgorithm = (typeof CryptoAlgorithms)[keyof typeof CryptoAlgorithms];
