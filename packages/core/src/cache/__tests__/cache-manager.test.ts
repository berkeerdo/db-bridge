import { describe, it, expect } from 'vitest';

import { DefaultCacheStrategy } from '../cache-strategy';

import type { QueryResult } from '../../interfaces';

describe('DefaultCacheStrategy', () => {
  const strategy = new DefaultCacheStrategy();

  const mockResult: QueryResult = {
    rows: [{ id: 1, name: 'test' }],
    rowCount: 1,
  };

  describe('shouldCache', () => {
    it('should cache SELECT queries', () => {
      expect(strategy.shouldCache('SELECT * FROM users', mockResult)).toBe(true);
    });

    it('should cache SHOW queries', () => {
      expect(strategy.shouldCache('SHOW TABLES', mockResult)).toBe(true);
    });

    it('should not cache INSERT queries', () => {
      expect(strategy.shouldCache('INSERT INTO users VALUES (1)', mockResult)).toBe(false);
    });

    it('should not cache UPDATE queries', () => {
      expect(strategy.shouldCache('UPDATE users SET name = ?', mockResult)).toBe(false);
    });

    it('should not cache empty results', () => {
      const emptyResult: QueryResult = { rows: [], rowCount: 0 };
      expect(strategy.shouldCache('SELECT * FROM users', emptyResult)).toBe(false);
    });
  });

  describe('getCacheTTL', () => {
    it('should return custom TTL when provided', () => {
      expect(strategy.getCacheTTL('SELECT * FROM users', { ttl: 1800 })).toBe(1800);
    });

    it('should return appropriate TTL for aggregate queries', () => {
      expect(strategy.getCacheTTL('SELECT COUNT(*) FROM users')).toBe(300);
    });

    it('should return default TTL', () => {
      expect(strategy.getCacheTTL('SELECT * FROM users')).toBe(3600);
    });
  });

  describe('getCacheKey', () => {
    it('should return custom key when provided', () => {
      expect(strategy.getCacheKey('SELECT * FROM users', [], { key: 'custom' })).toBe('custom');
    });

    it('should generate key from SQL and params', () => {
      const key = strategy.getCacheKey('SELECT * FROM users', [1]);
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
    });
  });

  describe('getInvalidationPatterns', () => {
    it('should return patterns for table operations', () => {
      const patterns = strategy.getInvalidationPatterns('INSERT INTO users VALUES (?)');
      expect(patterns.length).toBeGreaterThan(0);
    });
  });
});
