import { describe, it, expect, vi } from 'vitest';

import {
  processDataForEncryption,
  encryptRow,
  processResultsForDecryption,
} from '../encryption-trait';

import type { CryptoProvider } from '../../crypto/crypto';
import type { EncryptionContext } from '../encryption-trait';

describe('encryption-trait', () => {
  const mockCrypto: CryptoProvider = {
    encryptField: vi.fn((value) => `encrypted:${value}`),
    decryptField: vi.fn((value: string) => value.replace('encrypted:', '')),
    generateKey: vi.fn(),
    hashForComparison: vi.fn(),
  };

  describe('processDataForEncryption', () => {
    it('should return data unchanged when no crypto provider', () => {
      const ctx: EncryptionContext = {
        crypto: undefined,
        encryptedFields: new Set(['password']),
        decryptedFields: new Set(),
      };

      const data = { username: 'john', password: 'secret' };
      const result = processDataForEncryption(ctx, data);
      expect(result).toEqual(data);
    });

    it('should return data unchanged when no encrypted fields', () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(),
        decryptedFields: new Set(),
      };

      const data = { username: 'john', password: 'secret' };
      const result = processDataForEncryption(ctx, data);
      expect(result).toEqual(data);
    });

    it('should encrypt specified fields in single record', () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(['password']),
        decryptedFields: new Set(),
      };

      const data = { username: 'john', password: 'secret' };
      const result = processDataForEncryption(ctx, data);
      expect(result).toEqual({
        username: 'john',
        password: 'encrypted:secret',
      });
    });

    it('should encrypt specified fields in array of records', () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(['password']),
        decryptedFields: new Set(),
      };

      const data = [
        { username: 'john', password: 'secret1' },
        { username: 'jane', password: 'secret2' },
      ];
      const result = processDataForEncryption(ctx, data);
      expect(result).toEqual([
        { username: 'john', password: 'encrypted:secret1' },
        { username: 'jane', password: 'encrypted:secret2' },
      ]);
    });
  });

  describe('encryptRow', () => {
    it('should return row unchanged when no crypto provider', () => {
      const ctx: EncryptionContext = {
        crypto: undefined,
        encryptedFields: new Set(['password']),
        decryptedFields: new Set(),
      };

      const row = { username: 'john', password: 'secret' };
      const result = encryptRow(ctx, row);
      expect(result).toEqual(row);
    });

    it('should only encrypt fields in encryptedFields set', () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(['password']),
        decryptedFields: new Set(),
      };

      const row = { username: 'john', password: 'secret', email: 'john@test.com' };
      const result = encryptRow(ctx, row);
      expect(result.username).toBe('john');
      expect(result.password).toBe('encrypted:secret');
      expect(result.email).toBe('john@test.com');
    });
  });

  describe('processResultsForDecryption', () => {
    it('should return results unchanged when no crypto provider', async () => {
      const ctx: EncryptionContext = {
        crypto: undefined,
        encryptedFields: new Set(),
        decryptedFields: new Set(['password']),
      };

      const result = {
        rows: [{ username: 'john', password: 'encrypted:secret' }],
        rowCount: 1,
        fields: [],
      };

      const processed = await processResultsForDecryption(ctx, result);
      expect(processed).toEqual(result);
    });

    it('should return results unchanged when no decrypted fields', async () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(),
        decryptedFields: new Set(),
      };

      const result = {
        rows: [{ username: 'john', password: 'encrypted:secret' }],
        rowCount: 1,
        fields: [],
      };

      const processed = await processResultsForDecryption(ctx, result);
      expect(processed).toEqual(result);
    });

    it('should decrypt specified fields', async () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(),
        decryptedFields: new Set(['password']),
      };

      const result = {
        rows: [{ username: 'john', password: 'encrypted:secret' }],
        rowCount: 1,
        fields: [],
      };

      const processed = await processResultsForDecryption(ctx, result);
      expect(processed.rows[0]).toEqual({
        username: 'john',
        password: 'secret',
      });
    });

    it('should handle decryption errors gracefully', async () => {
      const errorCrypto: CryptoProvider = {
        ...mockCrypto,
        decryptField: vi.fn(() => {
          throw new Error('Decryption failed');
        }),
      };

      const ctx: EncryptionContext = {
        crypto: errorCrypto,
        encryptedFields: new Set(),
        decryptedFields: new Set(['password']),
      };

      const result = {
        rows: [{ username: 'john', password: 'invalid' }],
        rowCount: 1,
        fields: [],
      };

      const processed = await processResultsForDecryption(ctx, result);
      // Should keep original value on error
      expect(processed.rows[0].password).toBe('invalid');
    });

    it('should skip non-string fields', async () => {
      const ctx: EncryptionContext = {
        crypto: mockCrypto,
        encryptedFields: new Set(),
        decryptedFields: new Set(['count']),
      };

      const result = {
        rows: [{ username: 'john', count: 42 }],
        rowCount: 1,
        fields: [],
      };

      const processed = await processResultsForDecryption(ctx, result);
      expect(processed.rows[0].count).toBe(42);
    });
  });
});
