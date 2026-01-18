import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CryptoProvider, CryptoAlgorithms } from '../src';

describe('Encryption', () => {
  let crypto: CryptoProvider;

  beforeEach(() => {
    crypto = new CryptoProvider();
    process.env['DB_BRIDGE_ENCRYPTION_KEY'] = crypto.generateKey();
  });

  it('should encrypt and decrypt strings', () => {
    const original = 'sensitive data';
    const encrypted = crypto.encryptField(original);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // Format check

    const decrypted = crypto.decryptField(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should encrypt and decrypt JSON objects', () => {
    const original = { user: 'john', data: [1, 2, 3], nested: { key: 'value' } };
    const encrypted = crypto.encryptField(original);

    const decrypted = crypto.decryptField(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('should handle null and undefined values', () => {
    expect(crypto.encryptField(null)).toBe('');
    expect(crypto.encryptField(undefined)).toBe('');
    expect(crypto.decryptField('')).toBe(null);
  });

  it('should generate consistent hashes', () => {
    const password = 'my-password';
    const hash1 = crypto.hash(password);
    const hash2 = crypto.hash(password);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
  });

  it('should compare hashes correctly', () => {
    const password = 'my-password';
    const hash = crypto.hash(password);

    expect(crypto.compareHash(password, hash)).toBe(true);
    expect(crypto.compareHash('wrong-password', hash)).toBe(false);
  });

  it('should work with different algorithms', () => {
    const aesCrypto = new CryptoProvider({ algorithm: CryptoAlgorithms.AES_256_CBC });
    const chaChaCrypto = new CryptoProvider({ algorithm: CryptoAlgorithms.CHACHA20_POLY1305 });

    const data = 'test data';

    const aesEncrypted = aesCrypto.encryptField(data);
    const chaChaEncrypted = chaChaCrypto.encryptField(data);

    expect(aesEncrypted).toContain('aes-256-cbc');
    expect(chaChaEncrypted).toContain('chacha20-poly1305');

    expect(aesCrypto.decryptField(aesEncrypted)).toBe(data);
    expect(chaChaCrypto.decryptField(chaChaEncrypted)).toBe(data);
  });
});
