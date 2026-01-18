/**
 * WhereBuilder Unit Tests
 *
 * Tests the WHERE clause construction for all supported operators.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { MySQLDialect } from '../src/dialect/mysql-dialect';
import { PostgreSQLDialect } from '../src/dialect/postgresql-dialect';
import { WhereBuilder } from '../src/query/where-builder';

describe('WhereBuilder', () => {
  let mysqlBuilder: WhereBuilder;
  let pgBuilder: WhereBuilder;

  beforeEach(() => {
    mysqlBuilder = new WhereBuilder(new MySQLDialect());
    pgBuilder = new WhereBuilder(new PostgreSQLDialect());
  });

  describe('Simple conditions', () => {
    it('should handle equality with two arguments', () => {
      mysqlBuilder.where('status', 'active');
      const conditions = mysqlBuilder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toBe('`status` = ?');
      expect(conditions[0].bindings).toEqual(['active']);
    });

    it('should handle operator with three arguments', () => {
      mysqlBuilder.where('age', '>=', 18);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`age` >= ?');
      expect(conditions[0].bindings).toEqual([18]);
    });

    it('should handle object syntax', () => {
      mysqlBuilder.where({ name: 'John', status: 'active' });
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('(`name` = ? AND `status` = ?)');
      expect(conditions[0].bindings).toEqual(['John', 'active']);
    });
  });

  describe('NULL handling', () => {
    it('should build IS NULL for null value with = operator', () => {
      mysqlBuilder.where('deleted_at', null);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`deleted_at` IS NULL');
      expect(conditions[0].bindings).toEqual([]);
    });

    it('should build IS NOT NULL for null value with != operator', () => {
      mysqlBuilder.where('deleted_at', '!=', null);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`deleted_at` IS NOT NULL');
      expect(conditions[0].bindings).toEqual([]);
    });

    it('should build whereNull', () => {
      mysqlBuilder.whereNull('deleted_at');
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`deleted_at` IS NULL');
    });

    it('should build whereNotNull', () => {
      mysqlBuilder.whereNotNull('email_verified_at');
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`email_verified_at` IS NOT NULL');
    });
  });

  describe('IN clause', () => {
    it('should build WHERE IN', () => {
      mysqlBuilder.whereIn('id', [1, 2, 3]);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`id` IN (?, ?, ?)');
      expect(conditions[0].bindings).toEqual([1, 2, 3]);
    });

    it('should build WHERE NOT IN', () => {
      mysqlBuilder.whereNotIn('status', ['banned', 'suspended']);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`status` NOT IN (?, ?)');
      expect(conditions[0].bindings).toEqual(['banned', 'suspended']);
    });

    it('should handle empty IN array (always false)', () => {
      mysqlBuilder.whereIn('id', []);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('1=0');
      expect(conditions[0].bindings).toEqual([]);
    });

    it('should handle empty NOT IN array (always true)', () => {
      mysqlBuilder.whereNotIn('id', []);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('1=1');
      expect(conditions[0].bindings).toEqual([]);
    });
  });

  describe('BETWEEN clause', () => {
    it('should build WHERE BETWEEN', () => {
      mysqlBuilder.whereBetween('price', 100, 500);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`price` BETWEEN ? AND ?');
      expect(conditions[0].bindings).toEqual([100, 500]);
    });

    it('should build WHERE NOT BETWEEN', () => {
      mysqlBuilder.whereNotBetween('age', 13, 17);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`age` NOT BETWEEN ? AND ?');
      expect(conditions[0].bindings).toEqual([13, 17]);
    });
  });

  describe('LIKE clause', () => {
    it('should build WHERE LIKE', () => {
      mysqlBuilder.whereLike('name', '%john%');
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`name` LIKE ?');
      expect(conditions[0].bindings).toEqual(['%john%']);
    });

    it('should build WHERE NOT LIKE', () => {
      mysqlBuilder.whereNotLike('email', '%spam%');
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`email` NOT LIKE ?');
      expect(conditions[0].bindings).toEqual(['%spam%']);
    });
  });

  describe('Raw SQL', () => {
    it('should build raw WHERE clause', () => {
      mysqlBuilder.whereRaw('price * quantity > ?', [1000]);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('price * quantity > ?');
      expect(conditions[0].bindings).toEqual([1000]);
    });

    it('should handle raw SQL without bindings', () => {
      mysqlBuilder.whereRaw('status IS NOT NULL');
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('status IS NOT NULL');
      expect(conditions[0].bindings).toEqual([]);
    });
  });

  describe('OR conditions', () => {
    it('should build OR WHERE', () => {
      mysqlBuilder.where('role', 'admin').orWhere('role', 'moderator');
      const conditions = mysqlBuilder.build();

      expect(conditions).toHaveLength(2);
      expect(conditions[0].type).toBe('AND'); // First is always AND
      expect(conditions[1].type).toBe('OR');
    });

    it('should support orWhere with operator', () => {
      mysqlBuilder.where('age', '>', 18).orWhere('parent_consent', true);
      const conditions = mysqlBuilder.build();

      expect(conditions[0].sql).toBe('`age` > ?');
      expect(conditions[1].sql).toBe('`parent_consent` = ?');
      expect(conditions[1].type).toBe('OR');
    });
  });

  describe('Multiple conditions', () => {
    it('should chain multiple AND conditions', () => {
      mysqlBuilder.where('active', true).where('age', '>=', 18).where('status', 'verified');

      const conditions = mysqlBuilder.build();

      expect(conditions).toHaveLength(3);
      expect(conditions.every((c) => c.type === 'AND')).toBe(true);
    });

    it('should mix AND and OR conditions', () => {
      mysqlBuilder.where('status', 'active').where('age', '>=', 18).orWhere('vip', true);

      const conditions = mysqlBuilder.build();

      expect(conditions).toHaveLength(3);
      expect(conditions[0].type).toBe('AND');
      expect(conditions[1].type).toBe('AND');
      expect(conditions[2].type).toBe('OR');
    });
  });

  describe('PostgreSQL dialect', () => {
    it('should use $1, $2 placeholders', () => {
      pgBuilder.where('status', 'active').where('age', '>=', 18);
      const conditions = pgBuilder.build();

      expect(conditions[0].sql).toBe('"status" = $1');
      expect(conditions[1].sql).toBe('"age" >= $2');
    });

    it('should use double quotes for identifiers', () => {
      pgBuilder.whereNull('deleted_at');
      const conditions = pgBuilder.build();

      expect(conditions[0].sql).toBe('"deleted_at" IS NULL');
    });
  });

  describe('Utility methods', () => {
    it('should report hasConditions correctly', () => {
      expect(mysqlBuilder.hasConditions()).toBe(false);

      mysqlBuilder.where('id', 1);
      expect(mysqlBuilder.hasConditions()).toBe(true);
    });

    it('should clear all conditions', () => {
      mysqlBuilder.where('id', 1).where('status', 'active');
      expect(mysqlBuilder.hasConditions()).toBe(true);

      mysqlBuilder.clear();
      expect(mysqlBuilder.hasConditions()).toBe(false);
    });

    it('should clone the builder', () => {
      mysqlBuilder.where('status', 'active');
      const cloned = mysqlBuilder.clone();

      cloned.where('role', 'admin');

      expect(mysqlBuilder.build()).toHaveLength(1);
      expect(cloned.build()).toHaveLength(2);
    });
  });
});
