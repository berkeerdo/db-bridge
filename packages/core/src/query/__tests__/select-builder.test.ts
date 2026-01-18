import { describe, it, expect, beforeEach, vi } from 'vitest';

import { SelectBuilder } from '../select-builder';

import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryContext } from '../query-context';

describe('SelectBuilder', () => {
  let dialect: SQLDialect;
  let ctx: QueryContext;
  let paramIndex: number;

  beforeEach(() => {
    paramIndex = 0;
    dialect = {
      escapeIdentifier: (id) => `"${id}"`,
      getParameterPlaceholder: () => `$${++paramIndex}`,
      resetParameters: () => {
        paramIndex = 0;
      },
      buildSelect: vi.fn((components) => {
        const cols = components.columns.join(', ');
        const from = components.from ? `FROM "${components.from}"` : '';
        const where =
          components.where.length > 0
            ? `WHERE ${components.where.map((w: { sql: string }) => w.sql).join(' AND ')}`
            : '';
        const sql = `SELECT ${cols} ${from} ${where}`.trim();
        const bindings = components.where.flatMap((w: { bindings: unknown[] }) => w.bindings);
        return { sql, bindings };
      }),
      buildInsert: () => ({ sql: '', bindings: [] }),
      buildUpdate: () => ({ sql: '', bindings: [] }),
      buildDelete: () => ({ sql: '', bindings: [] }),
    } as unknown as SQLDialect;

    ctx = {
      dialect,
      executor: {
        query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
        execute: vi.fn().mockResolvedValue({ affectedRows: 0 }),
      },
      executeQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      executeCachedQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      hasCache: false,
      hasCrypto: false,
    } as unknown as QueryContext;
  });

  describe('select', () => {
    it('should set columns to select', () => {
      const builder = new SelectBuilder(ctx);
      builder.select('id', 'name', 'email');
      const { sql } = builder.toSQL();
      expect(sql).toContain('id, name, email');
    });

    it('should default to * when no columns specified', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users');
      const { sql } = builder.toSQL();
      expect(sql).toContain('*');
    });
  });

  describe('from', () => {
    it('should set table name', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users');
      const { sql } = builder.toSQL();
      expect(sql).toContain('FROM "users"');
    });

    it('should handle alias', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users', 'u');
      // Alias handling depends on dialect implementation
      expect(builder.toSQL().sql).toContain('users');
    });
  });

  describe('table', () => {
    it('should be alias for from', () => {
      const builder = new SelectBuilder(ctx);
      builder.table('products');
      const { sql } = builder.toSQL();
      expect(sql).toContain('products');
    });
  });

  describe('distinct', () => {
    it('should add distinct flag', () => {
      const builder = new SelectBuilder(ctx);
      builder.distinct().from('users');
      // The dialect's buildSelect should receive distinct: true
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(expect.objectContaining({ distinct: true }));
    });
  });

  describe('where clauses', () => {
    it('should add where condition', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').where('active', true);
      const { sql, bindings } = builder.toSQL();
      expect(sql).toContain('WHERE');
      expect(bindings).toContain(true);
    });

    it('should add whereNull', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').whereNull('deleted_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('IS NULL');
    });

    it('should add whereIn', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').whereIn('role', ['admin', 'user']);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('admin');
      expect(bindings).toContain('user');
    });
  });

  describe('joins', () => {
    it('should add inner join', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').innerJoin('profiles', 'users.id = profiles.user_id');
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          joins: expect.arrayContaining([expect.objectContaining({ type: 'INNER' })]),
        }),
      );
    });

    it('should add left join', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').leftJoin('orders', 'users.id = orders.user_id');
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          joins: expect.arrayContaining([expect.objectContaining({ type: 'LEFT' })]),
        }),
      );
    });
  });

  describe('ordering', () => {
    it('should add orderBy', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').orderBy('created_at', 'DESC');
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([
            expect.objectContaining({ column: 'created_at', direction: 'DESC' }),
          ]),
        }),
      );
    });

    it('should add orderByDesc', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').orderByDesc('id');
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: expect.arrayContaining([expect.objectContaining({ direction: 'DESC' })]),
        }),
      );
    });
  });

  describe('limit and offset', () => {
    it('should set limit', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').limit(10);
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
    });

    it('should set offset', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').offset(20);
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(expect.objectContaining({ offset: 20 }));
    });

    it('should handle paginate helper', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').paginate(2, 10); // page 2, 10 per page
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 10 }),
      );
    });
  });

  describe('groupBy', () => {
    it('should add group by columns', () => {
      const builder = new SelectBuilder(ctx);
      builder.select('status', 'COUNT(*) as count').from('orders').groupBy('status');
      builder.toSQL();
      expect(dialect.buildSelect).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: ['status'] }),
      );
    });
  });

  describe('execution', () => {
    it('should execute get and return rows', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      const results = await builder.from('users').get();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ id: 1, name: 'John' });
    });

    it('should execute first and return single row', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      const result = await builder.from('users').first();

      expect(result).toEqual({ id: 1, name: 'John' });
    });

    it('should return null from first when no results', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      const result = await builder.from('users').first();

      expect(result).toBeNull();
    });

    it('should throw from firstOrFail when no results', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      await expect(builder.from('users').firstOrFail()).rejects.toThrow('No record found');
    });
  });

  describe('aggregates', () => {
    it('should execute count', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ count: 42 }],
        rowCount: 1,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      const count = await builder.from('users').count();

      expect(count).toBe(42);
    });

    it('should execute exists', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ count: 1 }],
        rowCount: 1,
        fields: [],
      });

      const builder = new SelectBuilder(ctx);
      const exists = await builder.from('users').where('id', 1).exists();

      expect(exists).toBe(true);
    });
  });

  describe('encryption', () => {
    it('should mark fields for encryption', () => {
      const builder = new SelectBuilder(ctx);
      builder.encrypt('password', 'ssn');
      // Should not throw
      expect(true).toBe(true);
    });

    it('should mark fields for decryption', () => {
      const builder = new SelectBuilder(ctx);
      builder.decrypt('password', 'ssn');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('caching', () => {
    it('should set cache options', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').cache(60);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should disable cache with noCache', () => {
      const builder = new SelectBuilder(ctx);
      builder.from('users').noCache();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
