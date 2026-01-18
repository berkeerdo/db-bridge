import { describe, it, expect, beforeEach, vi } from 'vitest';

import { UpdateBuilder } from '../update-builder';

import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryContext } from '../query-context';

describe('UpdateBuilder', () => {
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
      buildUpdate: vi.fn((components) => {
        const setClauses = Object.entries(components.data)
          .map(([key]) => `"${key}" = $${++paramIndex}`)
          .join(', ');
        const bindings = Object.values(components.data);
        const whereSql =
          components.where.length > 0
            ? ` WHERE ${components.where.map((w: { sql: string }) => w.sql).join(' AND ')}`
            : '';
        const whereBindings = components.where.flatMap((w: { bindings: unknown[] }) => w.bindings);
        const returning = components.returning
          ? ` RETURNING ${components.returning.join(', ')}`
          : '';
        return {
          sql: `UPDATE "${components.table}" SET ${setClauses}${whereSql}${returning}`,
          bindings: [...bindings, ...whereBindings],
        };
      }),
      buildDelete: () => ({ sql: '', bindings: [] }),
    } as unknown as SQLDialect;

    ctx = {
      dialect,
      executeQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      executeWrite: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      hasCrypto: false,
      encrypt: vi.fn((val) => `encrypted:${val}`),
    } as unknown as QueryContext;
  });

  describe('table', () => {
    it('should set table name', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ name: 'John' });
      const { sql } = builder.toSQL();
      expect(sql).toContain('"users"');
    });
  });

  describe('set', () => {
    it('should set values to update', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ name: 'John', email: 'john@example.com' });
      const { sql, bindings } = builder.toSQL();
      expect(sql).toContain('SET');
      expect(bindings).toContain('John');
      expect(bindings).toContain('john@example.com');
    });

    it('should merge multiple set calls', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ name: 'John' }).set({ email: 'john@example.com' });
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('John');
      expect(bindings).toContain('john@example.com');
    });
  });

  describe('encrypt', () => {
    it('should encrypt marked fields', () => {
      const cryptoCtx = { ...ctx, hasCrypto: true } as QueryContext;
      const builder = new UpdateBuilder(cryptoCtx);
      builder.table('users').set({ password: 'secret' }).encrypt('password');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('encrypted:secret');
    });

    it('should not encrypt if hasCrypto is false', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ password: 'secret' }).encrypt('password');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('secret');
    });
  });

  describe('returning', () => {
    it('should add RETURNING clause', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ name: 'John' }).returning('id', 'updated_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING id, updated_at');
    });
  });

  describe('where clauses', () => {
    it('should add where condition', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ name: 'John' }).where('id', 1);
      const { sql, bindings } = builder.toSQL();
      expect(sql).toContain('WHERE');
      expect(bindings).toContain(1);
    });

    it('should handle orWhere', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ active: true }).where('id', 1).orWhere('id', 2);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(1);
      expect(bindings).toContain(2);
    });

    it('should handle whereNull', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ deleted: true }).whereNull('deleted_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('IS NULL');
    });

    it('should handle whereNotNull', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ active: false }).whereNotNull('email');
      const { sql } = builder.toSQL();
      expect(sql).toContain('IS NOT NULL');
    });

    it('should handle whereIn', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ active: true }).whereIn('id', [1, 2, 3]);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(1);
      expect(bindings).toContain(2);
      expect(bindings).toContain(3);
    });

    it('should handle whereNotIn', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ active: false }).whereNotIn('role', ['admin', 'super']);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('admin');
      expect(bindings).toContain('super');
    });

    it('should handle whereBetween', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ tier: 'premium' }).whereBetween('age', 18, 65);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(18);
      expect(bindings).toContain(65);
    });

    it('should handle whereLike', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ verified: true }).whereLike('email', '%@company.com');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('%@company.com');
    });

    it('should handle whereRaw', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users').set({ score: 100 }).whereRaw('YEAR(created_at) = ?', [2024]);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(2024);
    });
  });

  describe('toSQL', () => {
    it('should throw when table is not set', () => {
      const builder = new UpdateBuilder(ctx);
      builder.set({ name: 'John' });
      expect(() => builder.toSQL()).toThrow('Table name is required for UPDATE');
    });

    it('should throw when data is empty', () => {
      const builder = new UpdateBuilder(ctx);
      builder.table('users');
      expect(() => builder.toSQL()).toThrow('Update data is required');
    });
  });

  describe('execute', () => {
    it('should execute update and return result', async () => {
      const builder = new UpdateBuilder(ctx);
      const result = await builder.table('users').set({ name: 'John' }).execute();
      expect(ctx.executeWrite).toHaveBeenCalled();
      expect(result.affectedRows).toBe(1);
    });
  });

  describe('getAffectedRows', () => {
    it('should return affected row count', async () => {
      ctx.executeWrite = vi.fn().mockResolvedValue({ affectedRows: 5 });
      const builder = new UpdateBuilder(ctx);
      const count = await builder.table('users').set({ active: true }).getAffectedRows();
      expect(count).toBe(5);
    });
  });

  describe('getUpdated', () => {
    it('should return updated row with RETURNING', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John', updated_at: new Date() }],
        rowCount: 1,
        fields: [],
      });

      const builder = new UpdateBuilder(ctx);
      const updated = await builder.table('users').set({ name: 'John' }).getUpdated();
      expect(updated).toHaveProperty('id', 1);
      expect(updated).toHaveProperty('name', 'John');
    });

    it('should add * to RETURNING if not specified', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new UpdateBuilder(ctx);
      await builder.table('users').set({ name: 'John' }).getUpdated();
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING *');
    });

    it('should return null when no rows updated', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const builder = new UpdateBuilder(ctx);
      const updated = await builder.table('users').set({ name: 'John' }).getUpdated();
      expect(updated).toBeNull();
    });
  });

  describe('getAllUpdated', () => {
    it('should return all updated rows', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ],
        rowCount: 2,
        fields: [],
      });

      const builder = new UpdateBuilder(ctx);
      const updated = await builder.table('users').set({ active: true }).getAllUpdated();
      expect(updated).toHaveLength(2);
      expect(updated[0]).toHaveProperty('name', 'John');
      expect(updated[1]).toHaveProperty('name', 'Jane');
    });
  });
});
