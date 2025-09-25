import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseQueryBuilder, DatabaseAdapter, QueryResult, ValidationError } from '../index';

class TestQueryBuilder<T = unknown> extends BaseQueryBuilder<T> {
  protected buildSelectSQL(): { sql: string; bindings: unknown[] } {
    const parts: string[] = ['SELECT', this.selectColumns.join(', ')];
    
    if (this.fromTable) {
      parts.push('FROM', this.escapeIdentifierFn(this.fromTable));
    }
    
    if (this.whereClauses.length > 0) {
      parts.push('WHERE');
      parts.push(
        this.whereClauses
          .map((clause, index) => {
            const prefix = index === 0 ? '' : clause.type;
            return `${prefix} ${clause.condition}`.trim();
          })
          .join(' '),
      );
    }
    
    if (this.limitValue !== undefined) {
      parts.push(`LIMIT ${this.limitValue}`);
    }
    
    return { sql: parts.join(' '), bindings: this.bindings };
  }

  protected buildInsertSQL(): { sql: string; bindings: unknown[] } {
    if (!this.insertTable || !this.insertData) {
      throw new ValidationError('Table and data are required for INSERT query');
    }
    
    const data = Array.isArray(this.insertData) ? this.insertData[0]! : this.insertData;
    const columns = Object.keys(data);
    const values = Object.values(data);
    
    const sql = `INSERT INTO ${this.escapeIdentifierFn(this.insertTable)} (${columns
      .map((col) => this.escapeIdentifierFn(col))
      .join(', ')}) VALUES (${columns.map((_, i) => this.parameterPlaceholderFn(i + 1)).join(', ')})`;
    
    return { sql, bindings: values };
  }

  protected buildUpdateSQL(): { sql: string; bindings: unknown[] } {
    if (!this.updateTable || !this.updateData) {
      throw new ValidationError('Table and data are required for UPDATE query');
    }
    
    const setClauses = Object.entries(this.updateData).map(([key], index) => {
      return `${this.escapeIdentifierFn(key)} = ${this.parameterPlaceholderFn(index + 1)}`;
    });
    
    const sql = `UPDATE ${this.escapeIdentifierFn(this.updateTable)} SET ${setClauses.join(', ')}`;
    const bindings = Object.values(this.updateData);
    
    return { sql, bindings };
  }

  protected buildDeleteSQL(): { sql: string; bindings: unknown[] } {
    if (!this.deleteTable) {
      throw new ValidationError('Table is required for DELETE query');
    }
    
    const sql = `DELETE FROM ${this.escapeIdentifierFn(this.deleteTable)}`;
    return { sql, bindings: [] };
  }
}

describe('BaseQueryBuilder', () => {
  let adapter: DatabaseAdapter;
  let queryBuilder: TestQueryBuilder;

  beforeEach(() => {
    adapter = {
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as any;
    
    queryBuilder = new TestQueryBuilder({
      adapter,
      escapeIdentifier: (id) => `"${id}"`,
      parameterPlaceholder: (index) => `$${index}`,
    });
  });

  describe('select queries', () => {
    it('should build basic SELECT query', () => {
      const { sql, bindings } = queryBuilder.select('id', 'name').from('users').toSQL();
      
      expect(sql).toBe('SELECT id, name FROM "users"');
      expect(bindings).toEqual([]);
    });

    it('should build SELECT with WHERE clause', () => {
      const { sql, bindings } = queryBuilder
        .select('*')
        .from('users')
        .where({ status: 'active' })
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" WHERE "status" = $1');
      expect(bindings).toEqual(['active']);
    });

    it('should build SELECT with multiple WHERE clauses', () => {
      const { sql, bindings } = queryBuilder
        .select('*')
        .from('users')
        .where({ status: 'active' })
        .where({ role: 'admin' })
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" WHERE "status" = $1 AND "role" = $2');
      expect(bindings).toEqual(['active', 'admin']);
    });

    it('should build SELECT with OR WHERE clause', () => {
      const { sql, bindings } = queryBuilder
        .select('*')
        .from('users')
        .where({ status: 'active' })
        .orWhere({ status: 'pending' })
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" WHERE "status" = $1 OR "status" = $2');
      expect(bindings).toEqual(['active', 'pending']);
    });

    it('should build SELECT with LIMIT', () => {
      const { sql } = queryBuilder.select('*').from('users').limit(10).toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" LIMIT 10');
    });

    it('should handle whereIn clause', () => {
      const { sql, bindings } = queryBuilder
        .select('*')
        .from('users')
        .whereIn('id', [1, 2, 3])
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" WHERE "id" IN ($1, $2, $3)');
      expect(bindings).toEqual([1, 2, 3]);
    });

    it('should handle whereNull clause', () => {
      const { sql, bindings } = queryBuilder
        .select('*')
        .from('users')
        .whereNull('deleted_at')
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM "users" WHERE "deleted_at" IS NULL');
      expect(bindings).toEqual([]);
    });
  });

  describe('insert queries', () => {
    it('should build INSERT query', () => {
      const { sql, bindings } = queryBuilder
        .insert('users', { name: 'John', email: 'john@example.com' })
        .toSQL();
      
      expect(sql).toBe('INSERT INTO "users" ("name", "email") VALUES ($1, $2)');
      expect(bindings).toEqual(['John', 'john@example.com']);
    });

    it('should throw for INSERT without table', () => {
      expect(() => queryBuilder.insert('', { name: 'Test' }).toSQL()).toThrow(ValidationError);
    });
  });

  describe('update queries', () => {
    it('should build UPDATE query', () => {
      const { sql, bindings } = queryBuilder
        .update('users', { name: 'John Updated' })
        .toSQL();
      
      expect(sql).toBe('UPDATE "users" SET "name" = $1');
      expect(bindings).toEqual(['John Updated']);
    });

    it('should build UPDATE with multiple fields', () => {
      const { sql, bindings } = queryBuilder
        .update('users', { name: 'John', status: 'active' })
        .toSQL();
      
      expect(sql).toBe('UPDATE "users" SET "name" = $1, "status" = $2');
      expect(bindings).toEqual(['John', 'active']);
    });
  });

  describe('delete queries', () => {
    it('should build DELETE query', () => {
      const { sql, bindings } = queryBuilder.delete('users').toSQL();
      
      expect(sql).toBe('DELETE FROM "users"');
      expect(bindings).toEqual([]);
    });
  });

  describe('raw queries', () => {
    it('should handle raw SQL', () => {
      const { sql, bindings } = queryBuilder
        .raw('SELECT * FROM users WHERE id = ?', [123])
        .toSQL();
      
      expect(sql).toBe('SELECT * FROM users WHERE id = ?');
      expect(bindings).toEqual([123]);
    });
  });

  describe('query execution', () => {
    it('should execute query through adapter', async () => {
      await queryBuilder.select('*').from('users').execute();
      
      expect(adapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users"',
        [],
        undefined,
      );
    });

    it('should execute first() query with limit', async () => {
      await queryBuilder.select('*').from('users').first();
      
      expect(adapter.query).toHaveBeenCalledWith(
        'SELECT * FROM "users" LIMIT 1',
        [],
        undefined,
      );
    });

    it('should execute count() query', async () => {
      vi.mocked(adapter.query).mockResolvedValueOnce({
        rows: [{ count: '5' }],
        rowCount: 1,
      });
      
      const count = await queryBuilder.select('*').from('users').count();
      
      expect(count).toBe(5);
      expect(adapter.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM "users"',
        [],
        undefined,
      );
    });

    it('should execute exists() query', async () => {
      vi.mocked(adapter.query).mockResolvedValueOnce({
        rows: [{ count: '1' }],
        rowCount: 1,
      });
      
      const exists = await queryBuilder.select('*').from('users').exists();
      
      expect(exists).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate table names', () => {
      expect(() => queryBuilder.from('123invalid')).toThrow(ValidationError);
    });

    it('should validate column names', () => {
      expect(() => queryBuilder.where({ '123column': 'value' })).toThrow(ValidationError);
    });

    it('should validate whereIn requires values', () => {
      expect(() => queryBuilder.whereIn('id', [])).toThrow('whereIn requires at least one value');
    });

    it('should validate limit is non-negative', () => {
      expect(() => queryBuilder.limit(-1)).toThrow('Limit must be non-negative');
    });

    it('should validate offset is non-negative', () => {
      expect(() => queryBuilder.offset(-1)).toThrow('Offset must be non-negative');
    });
  });
});