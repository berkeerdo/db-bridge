import { describe, it, expect, beforeEach, vi } from 'vitest';

import { DeleteBuilder } from '../delete-builder';

import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryContext } from '../query-context';

describe('DeleteBuilder', () => {
  let dialect: SQLDialect;
  let ctx: QueryContext;
  let paramIndex: number;

  beforeEach(() => {
    paramIndex = 0;
    dialect = {
      name: 'postgresql',
      escapeIdentifier: (id) => `"${id}"`,
      getParameterPlaceholder: () => `$${++paramIndex}`,
      resetParameters: () => {
        paramIndex = 0;
      },
      buildSelect: () => ({ sql: '', bindings: [] }),
      buildInsert: () => ({ sql: '', bindings: [] }),
      buildUpdate: () => ({ sql: '', bindings: [] }),
      buildDelete: vi.fn((components) => {
        const whereSql =
          components.where.length > 0
            ? ` WHERE ${components.where.map((w: { sql: string }) => w.sql).join(' AND ')}`
            : '';
        const whereBindings = components.where.flatMap((w: { bindings: unknown[] }) => w.bindings);
        const returning = components.returning
          ? ` RETURNING ${components.returning.join(', ')}`
          : '';
        return {
          sql: `DELETE FROM "${components.table}"${whereSql}${returning}`,
          bindings: whereBindings,
        };
      }),
    } as unknown as SQLDialect;

    ctx = {
      dialect,
      executeQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      executeWrite: vi.fn().mockResolvedValue({ affectedRows: 1 }),
    } as unknown as QueryContext;
  });

  describe('from', () => {
    it('should set table name', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').where('id', 1);
      const { sql } = builder.toSQL();
      expect(sql).toContain('"users"');
    });
  });

  describe('table', () => {
    it('should be alias for from', () => {
      const builder = new DeleteBuilder(ctx);
      builder.table('products').where('id', 1);
      const { sql } = builder.toSQL();
      expect(sql).toContain('"products"');
    });
  });

  describe('returning', () => {
    it('should add RETURNING clause', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').where('id', 1).returning('id', 'name');
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING id, name');
    });
  });

  describe('force', () => {
    it('should allow delete without WHERE clause', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').force();
      expect(() => builder.toSQL()).not.toThrow();
    });
  });

  describe('where clauses', () => {
    it('should add where condition', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').where('id', 1);
      const { sql, bindings } = builder.toSQL();
      expect(sql).toContain('WHERE');
      expect(bindings).toContain(1);
    });

    it('should handle orWhere', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').where('id', 1).orWhere('id', 2);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(1);
      expect(bindings).toContain(2);
    });

    it('should handle whereNull', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('sessions').whereNull('expires_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('IS NULL');
    });

    it('should handle whereNotNull', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').whereNotNull('deleted_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('IS NOT NULL');
    });

    it('should handle whereIn', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').whereIn('id', [1, 2, 3]);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(1);
      expect(bindings).toContain(2);
      expect(bindings).toContain(3);
    });

    it('should handle whereNotIn', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').whereNotIn('status', ['active', 'pending']);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('active');
      expect(bindings).toContain('pending');
    });

    it('should handle whereBetween', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('logs').whereBetween('created_at', '2024-01-01', '2024-12-31');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('2024-01-01');
      expect(bindings).toContain('2024-12-31');
    });

    it('should handle whereLike', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users').whereLike('email', '%@spam.com');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('%@spam.com');
    });

    it('should handle whereRaw', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('logs').whereRaw('YEAR(created_at) < ?', [2020]);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(2020);
    });
  });

  describe('toSQL', () => {
    it('should throw when table is not set', () => {
      const builder = new DeleteBuilder(ctx);
      builder.where('id', 1);
      expect(() => builder.toSQL()).toThrow('Table name is required for DELETE');
    });

    it('should throw when no WHERE clause and force not called', () => {
      const builder = new DeleteBuilder(ctx);
      builder.from('users');
      expect(() => builder.toSQL()).toThrow('DELETE without WHERE clause is dangerous');
    });
  });

  describe('execute', () => {
    it('should execute delete and return result', async () => {
      const builder = new DeleteBuilder(ctx);
      const result = await builder.from('users').where('id', 1).execute();
      expect(ctx.executeWrite).toHaveBeenCalled();
      expect(result.affectedRows).toBe(1);
    });
  });

  describe('getAffectedRows', () => {
    it('should return affected row count', async () => {
      ctx.executeWrite = vi.fn().mockResolvedValue({ affectedRows: 10 });
      const builder = new DeleteBuilder(ctx);
      const count = await builder.from('sessions').where('expired', true).getAffectedRows();
      expect(count).toBe(10);
    });
  });

  describe('getDeleted', () => {
    it('should return deleted row with RETURNING', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new DeleteBuilder(ctx);
      const deleted = await builder.from('users').where('id', 1).getDeleted();
      expect(deleted).toEqual({ id: 1, name: 'John' });
    });

    it('should add * to RETURNING if not specified', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new DeleteBuilder(ctx);
      await builder.from('users').where('id', 1).getDeleted();
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING *');
    });

    it('should return null when no rows deleted', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const builder = new DeleteBuilder(ctx);
      const deleted = await builder.from('users').where('id', 999).getDeleted();
      expect(deleted).toBeNull();
    });
  });

  describe('getAllDeleted', () => {
    it('should return all deleted rows', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
        rowCount: 2,
        fields: [],
      });

      const builder = new DeleteBuilder(ctx);
      const deleted = await builder.from('users').whereIn('id', [1, 2]).getAllDeleted();
      expect(deleted).toHaveLength(2);
      expect(deleted[0]).toHaveProperty('name', 'John');
      expect(deleted[1]).toHaveProperty('name', 'Jane');
    });
  });

  describe('truncate', () => {
    it('should execute TRUNCATE TABLE', async () => {
      const builder = new DeleteBuilder(ctx);
      await builder.from('logs').truncate();
      expect(ctx.executeWrite).toHaveBeenCalledWith('TRUNCATE TABLE "logs"', []);
    });

    it('should throw when table is not set', async () => {
      const builder = new DeleteBuilder(ctx);
      await expect(builder.truncate()).rejects.toThrow('Table name is required for TRUNCATE');
    });
  });
});
