import { describe, it, expect } from 'vitest';

import { Crypto } from '../crypto-class';
import { Crypto as CryptoFromIndex } from '../index';

describe('Crypto exports', () => {
  it('should export Crypto from index', () => {
    expect(CryptoFromIndex).toBe(Crypto);
  });
});

describe('Crypto', () => {
  const secret = 'my-secret-key-for-testing';

  describe('constructor', () => {
    it('should create instance with default algorithm', () => {
      const crypto = new Crypto(secret);
      expect(crypto).toBeInstanceOf(Crypto);
    });

    it('should create instance with custom algorithm', () => {
      const crypto = new Crypto(secret, 'aes-256-gcm');
      expect(crypto).toBeInstanceOf(Crypto);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt string', () => {
      const crypto = new Crypto(secret);
      const plaintext = 'Hello, World!';

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt object', () => {
      const crypto = new Crypto(secret);
      const data = { name: 'John', age: 30, active: true };

      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should encrypt and decrypt array', () => {
      const crypto = new Crypto(secret);
      const data = [1, 2, 3, 'hello'];

      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should encrypt and decrypt number', () => {
      const crypto = new Crypto(secret);
      const data = 42;

      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(data);
    });

    it('should encrypt and decrypt boolean', () => {
      const crypto = new Crypto(secret);

      const encryptedTrue = crypto.encrypt(true);
      const encryptedFalse = crypto.encrypt(false);

      expect(crypto.decrypt(encryptedTrue)).toBe(true);
      expect(crypto.decrypt(encryptedFalse)).toBe(false);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const crypto = new Crypto(secret);
      const plaintext = 'Hello, World!';

      const encrypted1 = crypto.encrypt(plaintext);
      const encrypted2 = crypto.encrypt(plaintext);

      // Different ciphertext due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both decrypt to same plaintext
      expect(crypto.decrypt(encrypted1)).toBe(plaintext);
      expect(crypto.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should fail decryption with wrong key', () => {
      const crypto1 = new Crypto('key1');
      const crypto2 = new Crypto('key2');

      const encrypted = crypto1.encrypt('secret data');

      expect(() => crypto2.decrypt(encrypted)).toThrow();
    });

    it('should handle empty string', () => {
      const crypto = new Crypto(secret);
      const plaintext = '';

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const crypto = new Crypto(secret);
      const plaintext = '你好世界 🌍 مرحبا';

      const encrypted = crypto.encrypt(plaintext);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle nested objects', () => {
      const crypto = new Crypto(secret);
      const data = {
        user: {
          name: 'John',
          address: {
            city: 'New York',
            zip: '10001',
          },
        },
        tags: ['admin', 'user'],
      };

      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toEqual(data);
    });

    it('should handle null value in object', () => {
      const crypto = new Crypto(secret);
      const data = { value: null };

      const encrypted = crypto.encrypt(data);
      const decrypted = crypto.decrypt(encrypted);

      expect(decrypted).toEqual(data);
    });
  });

  describe('hash', () => {
    it('should create sha256 hash by default', () => {
      const crypto = new Crypto(secret);
      const hash = crypto.hash('hello');

      expect(hash).toHaveLength(64); // SHA256 produces 64 hex chars
    });

    it('should create sha512 hash', () => {
      const crypto = new Crypto(secret);
      const hash = crypto.hash('hello', 'sha512');

      expect(hash).toHaveLength(128); // SHA512 produces 128 hex chars
    });

    it('should create md5 hash', () => {
      const crypto = new Crypto(secret);
      const hash = crypto.hash('hello', 'md5');

      expect(hash).toHaveLength(32); // MD5 produces 32 hex chars
    });

    it('should produce consistent hash for same input', () => {
      const crypto = new Crypto(secret);

      const hash1 = crypto.hash('hello');
      const hash2 = crypto.hash('hello');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const crypto = new Crypto(secret);

      const hash1 = crypto.hash('hello');
      const hash2 = crypto.hash('world');

      expect(hash1).not.toBe(hash2);
    });

    it('should hash known value correctly', () => {
      const crypto = new Crypto(secret);
      // Known SHA256 hash of "hello"
      const expectedHash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

      expect(crypto.hash('hello')).toBe(expectedHash);
    });
  });
});
