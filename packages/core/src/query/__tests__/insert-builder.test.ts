import { describe, it, expect, beforeEach, vi } from 'vitest';

import { InsertBuilder } from '../insert-builder';

import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryContext } from '../query-context';

describe('InsertBuilder', () => {
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
      buildInsert: vi.fn((components) => {
        const cols = Object.keys(components.data[0])
          .map((c) => `"${c}"`)
          .join(', ');
        const values = components.data
          .map((row: Record<string, unknown>) =>
            Object.values(row)
              .map(() => `$${++paramIndex}`)
              .join(', '),
          )
          .join('), (');
        const bindings = components.data.flatMap((row: Record<string, unknown>) =>
          Object.values(row),
        );
        const returning = components.returning
          ? ` RETURNING ${components.returning.join(', ')}`
          : '';
        return {
          sql: `INSERT INTO "${components.table}" (${cols}) VALUES (${values})${returning}`,
          bindings,
        };
      }),
      buildUpdate: () => ({ sql: '', bindings: [] }),
      buildDelete: () => ({ sql: '', bindings: [] }),
    } as unknown as SQLDialect;

    ctx = {
      dialect,
      executeQuery: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      executeWrite: vi.fn().mockResolvedValue({ affectedRows: 1, insertId: 123 }),
      hasCrypto: false,
      encrypt: vi.fn((val) => `encrypted:${val}`),
    } as unknown as QueryContext;
  });

  describe('into', () => {
    it('should set table name', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values({ name: 'John' });
      const { sql } = builder.toSQL();
      expect(sql).toContain('"users"');
    });
  });

  describe('table', () => {
    it('should be alias for into', () => {
      const builder = new InsertBuilder(ctx);
      builder.table('products').values({ name: 'Widget' });
      const { sql } = builder.toSQL();
      expect(sql).toContain('"products"');
    });
  });

  describe('values', () => {
    it('should handle single row object', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values({ name: 'John', email: 'john@example.com' });
      const { sql, bindings } = builder.toSQL();
      expect(sql).toContain('INSERT INTO');
      expect(bindings).toContain('John');
      expect(bindings).toContain('john@example.com');
    });

    it('should handle multiple rows (bulk insert)', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values([
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' },
      ]);
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('John');
      expect(bindings).toContain('Jane');
    });
  });

  describe('returning', () => {
    it('should add RETURNING clause', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values({ name: 'John' }).returning('id', 'created_at');
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING id, created_at');
    });
  });

  describe('ignore', () => {
    it('should add INSERT IGNORE for MySQL', () => {
      const mysqlDialect = { ...dialect, name: 'mysql' } as SQLDialect;
      const mysqlCtx = { ...ctx, dialect: mysqlDialect } as QueryContext;
      const builder = new InsertBuilder(mysqlCtx);
      builder.into('users').values({ name: 'John' }).ignore();
      const { sql } = builder.toSQL();
      expect(sql).toContain('INSERT IGNORE INTO');
    });

    it('should not add IGNORE for PostgreSQL', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values({ name: 'John' }).ignore();
      const { sql } = builder.toSQL();
      expect(sql).not.toContain('IGNORE');
    });
  });

  describe('encrypt', () => {
    it('should mark fields for encryption', () => {
      const cryptoCtx = { ...ctx, hasCrypto: true } as QueryContext;
      const builder = new InsertBuilder(cryptoCtx);
      builder.into('users').values({ name: 'John', password: 'secret' }).encrypt('password');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('encrypted:secret');
    });

    it('should not encrypt if hasCrypto is false', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users').values({ name: 'John', password: 'secret' }).encrypt('password');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain('secret');
    });

    it('should only encrypt string values', () => {
      const cryptoCtx = { ...ctx, hasCrypto: true } as QueryContext;
      const builder = new InsertBuilder(cryptoCtx);
      builder.into('users').values({ age: 25, password: 'secret' }).encrypt('age', 'password');
      const { bindings } = builder.toSQL();
      expect(bindings).toContain(25); // age is not encrypted
      expect(bindings).toContain('encrypted:secret');
    });
  });

  describe('toSQL', () => {
    it('should throw when table is not set', () => {
      const builder = new InsertBuilder(ctx);
      builder.values({ name: 'John' });
      expect(() => builder.toSQL()).toThrow('Table name is required for INSERT');
    });

    it('should throw when data is empty', () => {
      const builder = new InsertBuilder(ctx);
      builder.into('users');
      expect(() => builder.toSQL()).toThrow('Insert data is required');
    });
  });

  describe('execute', () => {
    it('should execute insert and return result', async () => {
      const builder = new InsertBuilder(ctx);
      const result = await builder.into('users').values({ name: 'John' }).execute();
      expect(ctx.executeWrite).toHaveBeenCalled();
      expect(result.affectedRows).toBe(1);
    });
  });

  describe('getInsertId', () => {
    it('should return inserted ID', async () => {
      const builder = new InsertBuilder(ctx);
      const id = await builder.into('users').values({ name: 'John' }).getInsertId();
      expect(id).toBe(123);
    });
  });

  describe('getInserted', () => {
    it('should return inserted row with RETURNING', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new InsertBuilder(ctx);
      const inserted = await builder.into('users').values({ name: 'John' }).getInserted();
      expect(inserted).toEqual({ id: 1, name: 'John' });
    });

    it('should add * to RETURNING if not specified', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const builder = new InsertBuilder(ctx);
      await builder.into('users').values({ name: 'John' }).getInserted();
      const { sql } = builder.toSQL();
      expect(sql).toContain('RETURNING *');
    });

    it('should return null when no rows returned', async () => {
      ctx.executeQuery = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const builder = new InsertBuilder(ctx);
      const inserted = await builder.into('users').values({ name: 'John' }).getInserted();
      expect(inserted).toBeNull();
    });
  });
});
