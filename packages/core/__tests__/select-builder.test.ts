/**
 * SelectBuilder Unit Tests
 *
 * Tests the fluent query builder for SELECT statements.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { MySQLDialect } from '../src/dialect/mysql-dialect';
import { PostgreSQLDialect } from '../src/dialect/postgresql-dialect';
import { SelectBuilder } from '../src/query/select-builder';

import type { QueryContext } from '../src/query/query-context';

// Mock QueryContext for testing
function createMockContext(dialect: 'mysql' | 'postgresql' = 'mysql'): QueryContext {
  const dialectInstance = dialect === 'mysql' ? new MySQLDialect() : new PostgreSQLDialect();

  return {
    dialect: dialectInstance,
    hasCache: false,
    hasCrypto: false,
    cacheConfig: undefined,
    async executeQuery<T>(sql: string, bindings: unknown[]) {
      return { rows: [] as T[], rowCount: 0, fields: [] };
    },
    async executeCachedQuery<T>(sql: string, bindings: unknown[], options: any) {
      return { rows: [] as T[], rowCount: 0, fields: [] };
    },
    encrypt(value: string) {
      return value;
    },
    decrypt(value: string) {
      return value;
    },
  };
}

describe('SelectBuilder', () => {
  let mysqlBuilder: SelectBuilder;
  let pgBuilder: SelectBuilder;

  beforeEach(() => {
    mysqlBuilder = new SelectBuilder(createMockContext('mysql'));
    pgBuilder = new SelectBuilder(createMockContext('postgresql'));
  });

  describe('Basic SELECT', () => {
    it('should build SELECT * FROM table', () => {
      const { sql, bindings } = mysqlBuilder.from('users').toSQL();

      expect(sql).toBe('SELECT * FROM `users`');
      expect(bindings).toEqual([]);
    });

    it('should build SELECT with specific columns', () => {
      const { sql, bindings } = mysqlBuilder.select('id', 'name', 'email').from('users').toSQL();

      expect(sql).toBe('SELECT id, name, email FROM `users`');
      expect(bindings).toEqual([]);
    });

    it('should support addSelect to add more columns', () => {
      const { sql } = mysqlBuilder.select('id').addSelect('name', 'email').from('users').toSQL();

      expect(sql).toBe('SELECT id, name, email FROM `users`');
    });

    it('should support DISTINCT', () => {
      const { sql } = mysqlBuilder.select('category').distinct().from('products').toSQL();

      expect(sql).toBe('SELECT DISTINCT category FROM `products`');
    });

    it('should support table alias', () => {
      const { sql } = mysqlBuilder.from('users', 'u').select('u.id', 'u.name').toSQL();

      expect(sql).toBe('SELECT u.id, u.name FROM `users` AS `u`');
    });
  });

  describe('WHERE Clauses', () => {
    it('should build WHERE with equality', () => {
      const { sql, bindings } = mysqlBuilder.from('users').where('id', 1).toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `id` = ?');
      expect(bindings).toEqual([1]);
    });

    it('should build WHERE with operator', () => {
      const { sql, bindings } = mysqlBuilder.from('users').where('age', '>=', 18).toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `age` >= ?');
      expect(bindings).toEqual([18]);
    });

    it('should build WHERE with object syntax', () => {
      const { sql, bindings } = mysqlBuilder
        .from('users')
        .where({ status: 'active', role: 'admin' })
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE (`status` = ? AND `role` = ?)');
      expect(bindings).toEqual(['active', 'admin']);
    });

    it('should build multiple WHERE conditions (AND)', () => {
      const { sql, bindings } = mysqlBuilder
        .from('users')
        .where('active', true)
        .where('age', '>', 18)
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `active` = ? AND `age` > ?');
      expect(bindings).toEqual([true, 18]);
    });

    it('should build OR WHERE conditions', () => {
      const { sql, bindings } = mysqlBuilder
        .from('users')
        .where('role', 'admin')
        .orWhere('role', 'moderator')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `role` = ? OR `role` = ?');
      expect(bindings).toEqual(['admin', 'moderator']);
    });

    it('should build WHERE NULL', () => {
      const { sql, bindings } = mysqlBuilder.from('users').whereNull('deleted_at').toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `deleted_at` IS NULL');
      expect(bindings).toEqual([]);
    });

    it('should build WHERE NOT NULL', () => {
      const { sql, bindings } = mysqlBuilder
        .from('users')
        .whereNotNull('email_verified_at')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `email_verified_at` IS NOT NULL');
      expect(bindings).toEqual([]);
    });

    it('should build WHERE IN', () => {
      const { sql, bindings } = mysqlBuilder.from('users').whereIn('id', [1, 2, 3]).toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `id` IN (?, ?, ?)');
      expect(bindings).toEqual([1, 2, 3]);
    });

    it('should build WHERE NOT IN', () => {
      const { sql, bindings } = mysqlBuilder
        .from('users')
        .whereNotIn('status', ['banned', 'suspended'])
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `status` NOT IN (?, ?)');
      expect(bindings).toEqual(['banned', 'suspended']);
    });

    it('should build WHERE BETWEEN', () => {
      const { sql, bindings } = mysqlBuilder
        .from('products')
        .whereBetween('price', 100, 500)
        .toSQL();

      expect(sql).toBe('SELECT * FROM `products` WHERE `price` BETWEEN ? AND ?');
      expect(bindings).toEqual([100, 500]);
    });

    it('should build WHERE LIKE', () => {
      const { sql, bindings } = mysqlBuilder.from('users').whereLike('name', '%john%').toSQL();

      expect(sql).toBe('SELECT * FROM `users` WHERE `name` LIKE ?');
      expect(bindings).toEqual(['%john%']);
    });

    it('should build raw WHERE', () => {
      const { sql, bindings } = mysqlBuilder
        .from('products')
        .whereRaw('price * quantity > ?', [1000])
        .toSQL();

      expect(sql).toBe('SELECT * FROM `products` WHERE price * quantity > ?');
      expect(bindings).toEqual([1000]);
    });
  });

  describe('JOIN Operations', () => {
    it('should build INNER JOIN', () => {
      const { sql } = mysqlBuilder
        .from('orders')
        .join('users', 'orders.user_id = users.id')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `orders` INNER JOIN `users` ON orders.user_id = users.id');
    });

    it('should build LEFT JOIN', () => {
      const { sql } = mysqlBuilder
        .from('users')
        .leftJoin('orders', 'users.id = orders.user_id')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` LEFT JOIN `orders` ON users.id = orders.user_id');
    });

    it('should build RIGHT JOIN', () => {
      const { sql } = mysqlBuilder
        .from('orders')
        .rightJoin('users', 'orders.user_id = users.id')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `orders` RIGHT JOIN `users` ON orders.user_id = users.id');
    });

    it('should build CROSS JOIN', () => {
      const { sql } = mysqlBuilder.from('colors').crossJoin('sizes').toSQL();

      expect(sql).toContain('CROSS JOIN');
      expect(sql).toContain('`colors`');
      expect(sql).toContain('`sizes`');
    });

    it('should build JOIN with alias', () => {
      const { sql } = mysqlBuilder
        .from('orders')
        .leftJoinAs('users', 'u', 'orders.user_id = u.id')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `orders` LEFT JOIN `users` AS `u` ON orders.user_id = u.id');
    });

    it('should build multiple JOINs', () => {
      const { sql } = mysqlBuilder
        .from('orders')
        .join('users', 'orders.user_id = users.id')
        .join('products', 'orders.product_id = products.id')
        .toSQL();

      expect(sql).toContain('INNER JOIN `users`');
      expect(sql).toContain('INNER JOIN `products`');
    });
  });

  describe('ORDER BY', () => {
    it('should build ORDER BY ASC (default)', () => {
      const { sql } = mysqlBuilder.from('users').orderBy('name').toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `name` ASC');
    });

    it('should build ORDER BY DESC', () => {
      const { sql } = mysqlBuilder.from('users').orderBy('created_at', 'DESC').toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `created_at` DESC');
    });

    it('should support orderByDesc convenience method', () => {
      const { sql } = mysqlBuilder.from('users').orderByDesc('created_at').toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `created_at` DESC');
    });

    it('should support orderByAsc convenience method', () => {
      const { sql } = mysqlBuilder.from('users').orderByAsc('name').toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `name` ASC');
    });

    it('should build multiple ORDER BY clauses', () => {
      const { sql } = mysqlBuilder
        .from('users')
        .orderBy('status', 'DESC')
        .orderBy('name', 'ASC')
        .toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `status` DESC, `name` ASC');
    });

    it('should clear ORDER BY clauses', () => {
      const { sql } = mysqlBuilder.from('users').orderBy('name').clearOrder().toSQL();

      expect(sql).toBe('SELECT * FROM `users`');
    });

    it('should reorder (clear and add new)', () => {
      const { sql } = mysqlBuilder.from('users').orderBy('name').reorder('id', 'DESC').toSQL();

      expect(sql).toBe('SELECT * FROM `users` ORDER BY `id` DESC');
    });

    it('should support raw ORDER BY', () => {
      const { sql } = mysqlBuilder
        .from('products')
        .orderByRaw('FIELD(status, "featured", "active", "inactive")')
        .toSQL();

      expect(sql).toContain('FIELD(status, "featured", "active", "inactive")');
    });
  });

  describe('LIMIT and OFFSET', () => {
    it('should build LIMIT', () => {
      const { sql } = mysqlBuilder.from('users').limit(10).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 10');
    });

    it('should build LIMIT with OFFSET', () => {
      const { sql } = mysqlBuilder.from('users').limit(10).offset(20).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 10 OFFSET 20');
    });

    it('should support skip() alias', () => {
      const { sql } = mysqlBuilder.from('users').limit(10).skip(20).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 10 OFFSET 20');
    });

    it('should support take() alias', () => {
      const { sql } = mysqlBuilder.from('users').take(10).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 10');
    });

    it('should support paginate()', () => {
      const { sql } = mysqlBuilder.from('users').paginate(3, 20).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 20 OFFSET 40');
    });

    it('should support forPage()', () => {
      const { sql } = mysqlBuilder.from('users').forPage(2, 15).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 15 OFFSET 15');
    });

    it('should default to 15 items per page in forPage()', () => {
      const { sql } = mysqlBuilder.from('users').forPage(3).toSQL();

      expect(sql).toBe('SELECT * FROM `users` LIMIT 15 OFFSET 30');
    });
  });

  describe('GROUP BY and HAVING', () => {
    it('should build GROUP BY', () => {
      const { sql } = mysqlBuilder
        .select('category', 'COUNT(*) as count')
        .from('products')
        .groupBy('category')
        .toSQL();

      expect(sql).toContain('GROUP BY');
      expect(sql).toContain('category');
      expect(sql).toContain('COUNT(*)');
    });

    it('should build multiple GROUP BY columns', () => {
      const { sql } = mysqlBuilder.from('products').groupBy('category', 'brand').toSQL();

      expect(sql).toContain('GROUP BY `category`, `brand`');
    });

    it('should build HAVING', () => {
      const { sql, bindings } = mysqlBuilder
        .select('category', 'COUNT(*) as count')
        .from('products')
        .groupBy('category')
        .having('COUNT(*) > ?', [10])
        .toSQL();

      expect(sql).toContain('HAVING COUNT(*) > ?');
      expect(bindings).toContain(10);
    });
  });

  describe('PostgreSQL Dialect', () => {
    it('should use $1, $2 placeholders', () => {
      const { sql, bindings } = pgBuilder
        .from('users')
        .where('status', 'active')
        .where('age', '>', 18)
        .toSQL();

      expect(sql).toBe('SELECT * FROM "users" WHERE "status" = $1 AND "age" > $2');
      expect(bindings).toEqual(['active', 18]);
    });

    it('should use double quotes for identifiers', () => {
      const { sql } = pgBuilder.select('id', 'name').from('users').toSQL();

      expect(sql).toContain('"users"');
      expect(sql).toContain('id');
      expect(sql).toContain('name');
    });
  });

  describe('clone()', () => {
    it('should create independent copy of builder', () => {
      const base = mysqlBuilder.from('users').where('active', true);
      const cloned = base.clone().where('role', 'admin');

      const baseSql = base.toSQL();
      const clonedSql = cloned.toSQL();

      expect(baseSql.sql).not.toContain('role');
      expect(clonedSql.sql).toContain('role');
    });

    it('should clone all builder state', () => {
      const original = mysqlBuilder
        .select('id', 'name')
        .from('users')
        .where('active', true)
        .orderBy('name')
        .limit(10);

      const cloned = original.clone();
      const originalSql = original.toSQL();
      const clonedSql = cloned.toSQL();

      expect(clonedSql.sql).toBe(originalSql.sql);
      expect(clonedSql.bindings).toEqual(originalSql.bindings);
    });
  });

  describe('Cache methods', () => {
    it('should track cache state', () => {
      const builder = mysqlBuilder.from('users').cache(3600);
      const state = builder.getCacheState();

      expect(state.enabled).toBe(false); // No cache adapter configured
    });

    it('should track cache options', () => {
      const builder = mysqlBuilder
        .from('users')
        .cacheTTL(1800)
        .cacheKey('my-key')
        .cacheTags('users', 'active');

      const state = builder.getCacheState();

      expect(state.ttl).toBe(1800);
      expect(state.key).toBe('my-key');
      expect(state.tags).toEqual(['users', 'active']);
    });

    it('should disable cache with noCache()', () => {
      const builder = mysqlBuilder.from('users').cache(3600).noCache();
      const state = builder.getCacheState();

      expect(state.enabled).toBe(false);
    });
  });
});
