import { describe, it, expect, vi } from 'vitest';
import {
  retry,
  withTimeout,
  generateCacheKey,
  parseCacheKey,
  sanitizeCacheKey,
  validateConnectionConfig,
  validateSQL,
  validateTableName,
  validateColumnName,
  TimeoutError,
  ValidationError,
} from '../index';

describe('Utils', () => {
  describe('retry', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const fn = vi.fn(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return 'success';
      });

      const result = await retry(fn, { maxRetries: 3, retryDelay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      });

      await expect(retry(fn, { maxRetries: 2, retryDelay: 10 })).rejects.toThrow('ECONNREFUSED');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('withTimeout', () => {
    it('should complete within timeout', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('success'), 10));
      const result = await withTimeout(promise, 100);
      expect(result).toBe('success');
    });

    it('should throw TimeoutError when exceeded', async () => {
      const promise = new Promise((resolve) => setTimeout(() => resolve('success'), 100));
      await expect(withTimeout(promise, 10)).rejects.toThrow(TimeoutError);
    });
  });

  describe('cache key utilities', () => {
    describe('generateCacheKey', () => {
      it('should generate consistent keys for same input', () => {
        const key1 = generateCacheKey('SELECT * FROM users', [1, 2]);
        const key2 = generateCacheKey('SELECT * FROM users', [1, 2]);
        expect(key1).toBe(key2);
      });

      it('should generate different keys for different SQL', () => {
        const key1 = generateCacheKey('SELECT * FROM users');
        const key2 = generateCacheKey('SELECT * FROM posts');
        expect(key1).not.toBe(key2);
      });

      it('should generate different keys for different params', () => {
        const key1 = generateCacheKey('SELECT * FROM users WHERE id = ?', [1]);
        const key2 = generateCacheKey('SELECT * FROM users WHERE id = ?', [2]);
        expect(key1).not.toBe(key2);
      });
    });

    describe('parseCacheKey', () => {
      it('should parse valid cache key', () => {
        const result = parseCacheKey('db-bridge:abc123');
        expect(result).toEqual({ prefix: 'db-bridge', hash: 'abc123' });
      });

      it('should return null for invalid key', () => {
        const result = parseCacheKey('invalid');
        expect(result).toBeNull();
      });
    });

    describe('sanitizeCacheKey', () => {
      it('should sanitize special characters', () => {
        const result = sanitizeCacheKey('key@#$%^&*()');
        expect(result).toBe('key_________');
      });

      it('should preserve valid characters', () => {
        const result = sanitizeCacheKey('key-123_test:value');
        expect(result).toBe('key-123_test:value');
      });
    });
  });

  describe('validation utilities', () => {
    describe('validateConnectionConfig', () => {
      it('should validate valid config with host', () => {
        expect(() =>
          validateConnectionConfig({
            host: 'localhost',
            database: 'test',
          }),
        ).not.toThrow();
      });

      it('should validate valid config with connectionString', () => {
        expect(() =>
          validateConnectionConfig({
            connectionString: 'postgresql://localhost/test',
          }),
        ).not.toThrow();
      });

      it('should throw for missing host and connectionString', () => {
        expect(() =>
          validateConnectionConfig({
            database: 'test',
          }),
        ).toThrow(ValidationError);
      });

      it('should validate port range', () => {
        expect(() =>
          validateConnectionConfig({
            host: 'localhost',
            database: 'test',
            port: 0,
          }),
        ).toThrow(ValidationError);
      });
    });

    describe('validateSQL', () => {
      it('should validate non-empty SQL', () => {
        expect(() => validateSQL('SELECT * FROM users')).not.toThrow();
      });

      it('should throw for empty SQL', () => {
        expect(() => validateSQL('')).toThrow('SQL query must be a non-empty string');
      });

      it('should throw for whitespace-only SQL', () => {
        expect(() => validateSQL('   ')).toThrow('SQL query cannot be empty');
      });
    });

    describe('validateTableName', () => {
      it('should validate valid table names', () => {
        expect(() => validateTableName('users')).not.toThrow();
        expect(() => validateTableName('user_accounts')).not.toThrow();
        expect(() => validateTableName('_temp')).not.toThrow();
      });

      it('should throw for invalid table names', () => {
        expect(() => validateTableName('123users')).toThrow(ValidationError);
        expect(() => validateTableName('user-accounts')).toThrow(ValidationError);
        expect(() => validateTableName('user accounts')).toThrow(ValidationError);
      });
    });

    describe('validateColumnName', () => {
      it('should validate valid column names', () => {
        expect(() => validateColumnName('id')).not.toThrow();
        expect(() => validateColumnName('user_name')).not.toThrow();
        expect(() => validateColumnName('_created')).not.toThrow();
      });

      it('should throw for invalid column names', () => {
        expect(() => validateColumnName('123column')).toThrow(ValidationError);
        expect(() => validateColumnName('column-name')).toThrow(ValidationError);
        expect(() => validateColumnName('column name')).toThrow(ValidationError);
      });
    });
  });
});