import { describe, it, expect, beforeEach } from 'vitest';

import { WhereBuilder } from '../where-builder';

import type { SQLDialect } from '../../dialect/sql-dialect';

describe('WhereBuilder', () => {
  let dialect: SQLDialect;
  let builder: WhereBuilder;
  let paramIndex: number;

  beforeEach(() => {
    paramIndex = 0;
    dialect = {
      escapeIdentifier: (id) => `"${id}"`,
      getParameterPlaceholder: () => `$${++paramIndex}`,
      resetParameters: () => {
        paramIndex = 0;
      },
      buildSelect: () => ({ sql: '', bindings: [] }),
      buildInsert: () => ({ sql: '', bindings: [] }),
      buildUpdate: () => ({ sql: '', bindings: [] }),
      buildDelete: () => ({ sql: '', bindings: [] }),
    } as SQLDialect;
    builder = new WhereBuilder(dialect);
  });

  describe('where', () => {
    it('should handle two-arg syntax (column, value)', () => {
      builder.where('name', 'John');
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('"name"');
      expect(conditions[0].sql).toContain('=');
      expect(conditions[0].bindings).toEqual(['John']);
    });

    it('should handle three-arg syntax (column, operator, value)', () => {
      builder.where('age', '>=', 18);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('>=');
      expect(conditions[0].bindings).toEqual([18]);
    });

    it('should handle object syntax', () => {
      builder.where({ name: 'John', active: true });
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('"name"');
      expect(conditions[0].sql).toContain('"active"');
    });

    it('should handle null values', () => {
      builder.where('deleted_at', null);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('IS NULL');
    });

    it('should handle != null', () => {
      builder.where('deleted_at', '!=', null);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('IS NOT NULL');
    });
  });

  describe('orWhere', () => {
    it('should add OR conjunction for subsequent clauses', () => {
      builder.where('name', 'John');
      builder.orWhere('name', 'Jane');
      const conditions = builder.build();

      expect(conditions).toHaveLength(2);
      expect(conditions[0].type).toBe('AND');
      expect(conditions[1].type).toBe('OR');
    });
  });

  describe('whereNull', () => {
    it('should add IS NULL condition', () => {
      builder.whereNull('deleted_at');
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('IS NULL');
      expect(conditions[0].sql).not.toContain('IS NOT NULL');
    });
  });

  describe('whereNotNull', () => {
    it('should add IS NOT NULL condition', () => {
      builder.whereNotNull('deleted_at');
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('IS NOT NULL');
    });
  });

  describe('whereIn', () => {
    it('should add IN clause', () => {
      builder.whereIn('status', ['active', 'pending']);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('IN');
      expect(conditions[0].bindings).toEqual(['active', 'pending']);
    });

    it('should handle empty array', () => {
      builder.whereIn('status', []);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toBe('1=0'); // Always false
    });
  });

  describe('whereNotIn', () => {
    it('should add NOT IN clause', () => {
      builder.whereNotIn('status', ['deleted', 'archived']);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('NOT IN');
    });

    it('should handle empty array', () => {
      builder.whereNotIn('status', []);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toBe('1=1'); // Always true
    });
  });

  describe('whereBetween', () => {
    it('should add BETWEEN clause', () => {
      builder.whereBetween('age', 18, 65);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('BETWEEN');
      expect(conditions[0].bindings).toEqual([18, 65]);
    });
  });

  describe('whereNotBetween', () => {
    it('should add NOT BETWEEN clause', () => {
      builder.whereNotBetween('age', 0, 17);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('NOT BETWEEN');
    });
  });

  describe('whereLike', () => {
    it('should add LIKE clause', () => {
      builder.whereLike('email', '%@example.com');
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('LIKE');
      expect(conditions[0].bindings).toEqual(['%@example.com']);
    });
  });

  describe('whereNotLike', () => {
    it('should add NOT LIKE clause', () => {
      builder.whereNotLike('email', '%@spam.com');
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toContain('NOT LIKE');
    });
  });

  describe('whereRaw', () => {
    it('should add raw SQL condition', () => {
      builder.whereRaw('YEAR(created_at) = ?', [2024]);
      const conditions = builder.build();

      expect(conditions).toHaveLength(1);
      expect(conditions[0].sql).toBe('YEAR(created_at) = ?');
      expect(conditions[0].bindings).toEqual([2024]);
    });
  });

  describe('utility methods', () => {
    it('hasConditions should return false for empty builder', () => {
      expect(builder.hasConditions()).toBe(false);
    });

    it('hasConditions should return true after adding conditions', () => {
      builder.where('id', 1);
      expect(builder.hasConditions()).toBe(true);
    });

    it('clear should remove all conditions', () => {
      builder.where('id', 1);
      builder.where('name', 'John');
      builder.clear();
      expect(builder.hasConditions()).toBe(false);
      expect(builder.build()).toHaveLength(0);
    });
  });

  describe('complex queries', () => {
    it('should build complex query with multiple conditions', () => {
      builder
        .where('status', 'active')
        .whereNotNull('email')
        .whereBetween('age', 18, 65)
        .whereIn('role', ['admin', 'user']);

      const conditions = builder.build();
      expect(conditions).toHaveLength(4);
    });
  });
});
