import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DialectFactory } from '../dialect-factory';
import { MySQLDialect } from '../mysql-dialect';
import { PostgreSQLDialect } from '../postgresql-dialect';

import type {
  SelectComponents,
  InsertComponents,
  UpdateComponents,
  DeleteComponents,
} from '../sql-dialect';

describe('MySQLDialect', () => {
  let dialect: MySQLDialect;

  beforeEach(() => {
    dialect = new MySQLDialect();
    dialect.resetParameters();
  });

  describe('config', () => {
    it('should have correct name', () => {
      expect(dialect.name).toBe('mysql');
    });

    it('should use backtick for identifier quote', () => {
      expect(dialect.config.identifierQuote).toBe('`');
    });

    it('should use LIMIT_OFFSET style', () => {
      expect(dialect.config.limitStyle).toBe('LIMIT_OFFSET');
    });
  });

  describe('getParameterPlaceholder', () => {
    it('should return ? for all parameters', () => {
      expect(dialect.getParameterPlaceholder()).toBe('?');
      expect(dialect.getParameterPlaceholder()).toBe('?');
      expect(dialect.getParameterPlaceholder()).toBe('?');
    });
  });

  describe('escapeIdentifier', () => {
    it('should wrap identifier with backticks', () => {
      expect(dialect.escapeIdentifier('users')).toBe('`users`');
    });

    it('should handle schema.table format', () => {
      expect(dialect.escapeIdentifier('mydb.users')).toBe('`mydb`.`users`');
    });
  });

  describe('escapeValue', () => {
    it('should escape null', () => {
      expect(dialect.escapeValue(null)).toBe('NULL');
    });

    it('should escape undefined', () => {
      expect(dialect.escapeValue(undefined)).toBe('NULL');
    });

    it('should escape boolean true', () => {
      expect(dialect.escapeValue(true)).toBe('TRUE');
    });

    it('should escape boolean false', () => {
      expect(dialect.escapeValue(false)).toBe('FALSE');
    });

    it('should escape number', () => {
      expect(dialect.escapeValue(42)).toBe('42');
      expect(dialect.escapeValue(3.14)).toBe('3.14');
    });

    it('should escape Date', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const escaped = dialect.escapeValue(date);
      expect(escaped).toContain('2024-01-15');
      expect(escaped).toContain('10:30:00');
    });

    it('should escape string with quotes', () => {
      expect(dialect.escapeValue('hello')).toBe("'hello'");
      expect(dialect.escapeValue("it's")).toBe("'it\\'s'");
    });

    it('should escape string with backslashes', () => {
      expect(dialect.escapeValue('path\\to\\file')).toBe("'path\\\\to\\\\file'");
    });

    it('should escape Buffer as hex', () => {
      const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      expect(dialect.escapeValue(buffer)).toBe("X'deadbeef'");
    });

    it('should escape arrays as JSON', () => {
      const arr = [1, 2, 3];
      const escaped = dialect.escapeValue(arr);
      expect(escaped).toContain('[1,2,3]');
    });

    it('should escape objects as JSON', () => {
      const obj = { key: 'value' };
      const escaped = dialect.escapeValue(obj);
      expect(escaped).toContain('{"key":"value"}');
    });
  });

  describe('buildSelect', () => {
    it('should build basic SELECT', () => {
      const components: SelectComponents = {
        columns: ['id', 'name'],
        from: 'users',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('SELECT id, name');
      expect(result.sql).toContain('FROM `users`');
    });

    it('should build SELECT with DISTINCT', () => {
      const components: SelectComponents = {
        columns: ['name'],
        distinct: true,
        from: 'users',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('SELECT DISTINCT name');
    });

    it('should build SELECT * when no columns', () => {
      const components: SelectComponents = {
        columns: [],
        from: 'users',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('SELECT *');
    });

    it('should build SELECT with alias', () => {
      const components: SelectComponents = {
        columns: ['*'],
        from: 'users',
        fromAlias: 'u',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('FROM `users` AS `u`');
    });

    it('should build SELECT with JOIN', () => {
      const components: SelectComponents = {
        columns: ['u.id', 'p.name'],
        from: 'users',
        joins: [
          {
            type: 'INNER',
            table: 'profiles',
            alias: 'p',
            condition: 'u.id = p.user_id',
            bindings: [],
          },
        ],
        where: [],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('INNER JOIN `profiles` AS `p` ON u.id = p.user_id');
    });

    it('should build SELECT with WHERE', () => {
      const components: SelectComponents = {
        columns: ['*'],
        from: 'users',
        joins: [],
        where: [{ type: 'AND', sql: 'id = ?', bindings: [1] }],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('WHERE id = ?');
      expect(result.bindings).toContain(1);
    });

    it('should build SELECT with GROUP BY', () => {
      const components: SelectComponents = {
        columns: ['status', 'COUNT(*)'],
        from: 'users',
        joins: [],
        where: [],
        groupBy: ['status'],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('GROUP BY `status`');
    });

    it('should build SELECT with HAVING', () => {
      const components: SelectComponents = {
        columns: ['status', 'COUNT(*)'],
        from: 'users',
        joins: [],
        where: [],
        groupBy: ['status'],
        having: { condition: 'COUNT(*) > ?', bindings: [5] },
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('HAVING COUNT(*) > ?');
      expect(result.bindings).toContain(5);
    });

    it('should build SELECT with ORDER BY', () => {
      const components: SelectComponents = {
        columns: ['*'],
        from: 'users',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [
          { column: 'created_at', direction: 'DESC' },
          { column: 'name', direction: 'ASC' },
        ],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('ORDER BY `created_at` DESC, `name` ASC');
    });

    it('should build SELECT with LIMIT and OFFSET', () => {
      const components: SelectComponents = {
        columns: ['*'],
        from: 'users',
        joins: [],
        where: [],
        groupBy: [],
        orderBy: [],
        limit: 10,
        offset: 20,
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('LIMIT 10');
      expect(result.sql).toContain('OFFSET 20');
    });
  });

  describe('buildInsert', () => {
    it('should build basic INSERT', () => {
      dialect.resetParameters();
      const components: InsertComponents = {
        table: 'users',
        data: [{ name: 'John', email: 'john@example.com' }],
      };

      const result = dialect.buildInsert(components);
      expect(result.sql).toContain('INSERT INTO `users`');
      expect(result.sql).toContain('(`name`, `email`)');
      expect(result.sql).toContain('VALUES (?, ?)');
      expect(result.bindings).toEqual(['John', 'john@example.com']);
    });

    it('should build INSERT with multiple rows', () => {
      dialect.resetParameters();
      const components: InsertComponents = {
        table: 'users',
        data: [
          { name: 'John', email: 'john@example.com' },
          { name: 'Jane', email: 'jane@example.com' },
        ],
      };

      const result = dialect.buildInsert(components);
      expect(result.sql).toContain('VALUES (?, ?), (?, ?)');
      expect(result.bindings.length).toBe(4);
    });
  });

  describe('buildUpdate', () => {
    it('should build basic UPDATE', () => {
      dialect.resetParameters();
      const components: UpdateComponents = {
        table: 'users',
        data: { name: 'John', email: 'john@example.com' },
        where: [{ type: 'AND', sql: 'id = ?', bindings: [1] }],
      };

      const result = dialect.buildUpdate(components);
      expect(result.sql).toContain('UPDATE `users` SET');
      expect(result.sql).toContain('`name` = ?');
      expect(result.sql).toContain('WHERE id = ?');
    });
  });

  describe('buildDelete', () => {
    it('should build basic DELETE', () => {
      const components: DeleteComponents = {
        table: 'users',
        where: [{ type: 'AND', sql: 'id = ?', bindings: [1] }],
      };

      const result = dialect.buildDelete(components);
      expect(result.sql).toContain('DELETE FROM `users`');
      expect(result.sql).toContain('WHERE id = ?');
    });

    it('should build DELETE without WHERE', () => {
      const components: DeleteComponents = {
        table: 'users',
        where: [],
      };

      const result = dialect.buildDelete(components);
      expect(result.sql).toBe('DELETE FROM `users`');
    });
  });

  describe('buildUpsert', () => {
    it('should build ON DUPLICATE KEY UPDATE', () => {
      dialect.resetParameters();
      const result = dialect.buildUpsert(
        'users',
        { id: 1, name: 'John', email: 'john@example.com' },
        ['id'],
      );

      expect(result.sql).toContain('INSERT INTO `users`');
      expect(result.sql).toContain('ON DUPLICATE KEY UPDATE');
      expect(result.sql).toContain('`name` = VALUES(`name`)');
      expect(result.sql).toContain('`email` = VALUES(`email`)');
    });
  });

  describe('buildReplace', () => {
    it('should build REPLACE INTO', () => {
      dialect.resetParameters();
      const result = dialect.buildReplace('users', { id: 1, name: 'John' });

      expect(result.sql).toContain('REPLACE INTO `users`');
      expect(result.sql).toContain('(`id`, `name`)');
      expect(result.sql).toContain('VALUES (?, ?)');
    });
  });

  describe('getLastInsertIdSQL', () => {
    it('should return LAST_INSERT_ID query', () => {
      expect(dialect.getLastInsertIdSQL()).toBe('SELECT LAST_INSERT_ID() as id');
    });
  });

  describe('dateFunctions', () => {
    it('should have dateFormat function', () => {
      const result = dialect.config.dateFunctions.dateFormat('created_at', '%Y-%m-%d');
      expect(result).toBe("DATE_FORMAT(created_at, '%Y-%m-%d')");
    });
  });

  describe('jsonOperators', () => {
    it('should have extract function', () => {
      const result = dialect.config.jsonOperators.extract('data', '$.name');
      expect(result).toBe("JSON_EXTRACT(data, '$.name')");
    });

    it('should have contains function', () => {
      const result = dialect.config.jsonOperators.contains('data', '{"key": "value"}');
      expect(result).toBe('JSON_CONTAINS(data, \'{"key": "value"}\')');
    });
  });
});

describe('PostgreSQLDialect', () => {
  let dialect: PostgreSQLDialect;

  beforeEach(() => {
    dialect = new PostgreSQLDialect();
    dialect.resetParameters();
  });

  describe('config', () => {
    it('should have correct name', () => {
      expect(dialect.name).toBe('postgresql');
    });

    it('should use double quote for identifier quote', () => {
      expect(dialect.config.identifierQuote).toBe('"');
    });

    it('should use || for concat operator', () => {
      expect(dialect.config.concatOperator).toBe('||');
    });
  });

  describe('getParameterPlaceholder', () => {
    it('should return $1, $2, $3...', () => {
      expect(dialect.getParameterPlaceholder()).toBe('$1');
      expect(dialect.getParameterPlaceholder()).toBe('$2');
      expect(dialect.getParameterPlaceholder()).toBe('$3');
    });

    it('should reset parameter index', () => {
      dialect.getParameterPlaceholder(); // $1
      dialect.getParameterPlaceholder(); // $2
      dialect.resetParameters();
      expect(dialect.getParameterPlaceholder()).toBe('$1');
    });
  });

  describe('escapeIdentifier', () => {
    it('should wrap identifier with double quotes', () => {
      expect(dialect.escapeIdentifier('users')).toBe('"users"');
    });

    it('should handle schema.table format', () => {
      expect(dialect.escapeIdentifier('public.users')).toBe('"public"."users"');
    });
  });

  describe('escapeValue', () => {
    it('should escape null', () => {
      expect(dialect.escapeValue(null)).toBe('NULL');
    });

    it('should escape boolean', () => {
      expect(dialect.escapeValue(true)).toBe('TRUE');
      expect(dialect.escapeValue(false)).toBe('FALSE');
    });

    it('should escape number', () => {
      expect(dialect.escapeValue(42)).toBe('42');
    });

    it('should escape Date with timestamptz cast', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const escaped = dialect.escapeValue(date);
      expect(escaped).toContain('2024-01-15');
      expect(escaped).toContain('::timestamptz');
    });

    it('should escape string with doubled quotes', () => {
      expect(dialect.escapeValue('hello')).toBe("'hello'");
      expect(dialect.escapeValue("it's")).toBe("'it''s'");
    });

    it('should escape Buffer as bytea', () => {
      const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
      expect(dialect.escapeValue(buffer)).toBe("'\\xdeadbeef'::bytea");
    });

    it('should escape array as ARRAY literal', () => {
      const arr = [1, 2, 3];
      expect(dialect.escapeValue(arr)).toBe('ARRAY[1, 2, 3]');
    });

    it('should escape nested array', () => {
      const arr = ['a', 'b'];
      expect(dialect.escapeValue(arr)).toBe("ARRAY['a', 'b']");
    });

    it('should escape object as JSONB', () => {
      const obj = { key: 'value' };
      expect(dialect.escapeValue(obj)).toBe('\'{"key":"value"}\'::jsonb');
    });
  });

  describe('buildSelect', () => {
    it('should build SELECT with PostgreSQL parameter placeholders', () => {
      dialect.resetParameters();
      const components: SelectComponents = {
        columns: ['*'],
        from: 'users',
        joins: [],
        where: [{ type: 'AND', sql: `id = ${dialect.getParameterPlaceholder()}`, bindings: [1] }],
        groupBy: [],
        orderBy: [],
      };

      const result = dialect.buildSelect(components);
      expect(result.sql).toContain('WHERE id = $1');
    });
  });

  describe('buildInsert with RETURNING', () => {
    it('should build INSERT with RETURNING clause', () => {
      dialect.resetParameters();
      const components: InsertComponents = {
        table: 'users',
        data: [{ name: 'John' }],
        returning: ['id', 'created_at'],
      };

      const result = dialect.buildInsert(components);
      expect(result.sql).toContain('RETURNING "id", "created_at"');
    });
  });

  describe('buildUpdate with RETURNING', () => {
    it('should build UPDATE with RETURNING clause', () => {
      dialect.resetParameters();
      const components: UpdateComponents = {
        table: 'users',
        data: { name: 'John' },
        where: [],
        returning: ['id'],
      };

      const result = dialect.buildUpdate(components);
      expect(result.sql).toContain('RETURNING "id"');
    });
  });

  describe('buildDelete with RETURNING', () => {
    it('should build DELETE with RETURNING clause', () => {
      const components: DeleteComponents = {
        table: 'users',
        where: [{ type: 'AND', sql: 'id = $1', bindings: [1] }],
        returning: ['id', 'name'],
      };

      const result = dialect.buildDelete(components);
      expect(result.sql).toContain('RETURNING "id", "name"');
    });
  });

  describe('buildUpsert', () => {
    it('should build ON CONFLICT DO UPDATE', () => {
      dialect.resetParameters();
      const result = dialect.buildUpsert(
        'users',
        { id: 1, name: 'John', email: 'john@example.com' },
        ['id'],
      );

      expect(result.sql).toContain('INSERT INTO "users"');
      expect(result.sql).toContain('ON CONFLICT ("id")');
      expect(result.sql).toContain('DO UPDATE SET');
      expect(result.sql).toContain('"name" = EXCLUDED."name"');
    });

    it('should build ON CONFLICT DO NOTHING when no update columns', () => {
      dialect.resetParameters();
      const result = dialect.buildUpsert(
        'users',
        { id: 1 },
        ['id'],
        [], // Empty update columns
      );

      expect(result.sql).toContain('DO NOTHING');
    });

    it('should use specified update columns', () => {
      dialect.resetParameters();
      const result = dialect.buildUpsert(
        'users',
        { id: 1, name: 'John', email: 'john@example.com' },
        ['id'],
        ['name'], // Only update name
      );

      expect(result.sql).toContain('"name" = EXCLUDED."name"');
      expect(result.sql).not.toContain('"email" = EXCLUDED."email"');
    });
  });

  describe('buildWithCTE', () => {
    it('should build WITH clause', () => {
      const result = dialect.buildWithCTE(
        'active_users',
        'SELECT * FROM users WHERE active = true',
        'SELECT * FROM active_users',
      );

      expect(result).toContain('WITH "active_users" AS');
      expect(result).toContain('SELECT * FROM users WHERE active = true');
      expect(result).toContain('SELECT * FROM active_users');
    });

    it('should build WITH RECURSIVE clause', () => {
      const result = dialect.buildWithCTE(
        'tree',
        'SELECT * FROM categories',
        'SELECT * FROM tree',
        true,
      );

      expect(result).toContain('WITH RECURSIVE "tree" AS');
    });
  });

  describe('buildReturning', () => {
    it('should build RETURNING * when no columns', () => {
      expect(dialect.buildReturning([])).toBe('RETURNING *');
    });

    it('should build RETURNING with specific columns', () => {
      expect(dialect.buildReturning(['id', 'name'])).toBe('RETURNING "id", "name"');
    });
  });

  describe('buildArrayContains', () => {
    it('should build ANY() expression', () => {
      const result = dialect.buildArrayContains('tags', 'javascript');
      expect(result).toBe('\'javascript\' = ANY("tags")');
    });
  });

  describe('buildArrayOverlap', () => {
    it('should build && expression', () => {
      const result = dialect.buildArrayOverlap('tags', ['js', 'ts']);
      expect(result).toBe("\"tags\" && ARRAY['js', 'ts']");
    });
  });

  describe('buildTextSearch', () => {
    it('should build full-text search expression', () => {
      const result = dialect.buildTextSearch('content', 'hello world');
      expect(result).toContain('to_tsvector');
      expect(result).toContain('plainto_tsquery');
      expect(result).toContain('@@');
    });

    it('should use custom config', () => {
      const result = dialect.buildTextSearch('content', 'hello', 'simple');
      expect(result).toContain("'simple'");
    });
  });

  describe('buildJsonPath', () => {
    it('should build JSON path expression', () => {
      const result = dialect.buildJsonPath('data', ['user', 'name']);
      expect(result).toBe("\"data\"->'user'->'name'");
    });
  });

  describe('buildJsonPathText', () => {
    it('should return column when path is empty', () => {
      const result = dialect.buildJsonPathText('data', []);
      expect(result).toBe('data');
    });

    it('should build ->> expression for single path', () => {
      const result = dialect.buildJsonPathText('data', ['name']);
      expect(result).toBe('"data"->>\'name\'');
    });

    it('should build nested path expression', () => {
      const result = dialect.buildJsonPathText('data', ['user', 'name']);
      expect(result).toContain('"data"->\'user\'');
      expect(result).toContain("'name'");
    });
  });

  describe('dateFunctions', () => {
    it('should have dateFormat function using TO_CHAR', () => {
      const result = dialect.config.dateFunctions.dateFormat('created_at', 'YYYY-MM-DD');
      expect(result).toBe("TO_CHAR(created_at, 'YYYY-MM-DD')");
    });
  });

  describe('jsonOperators', () => {
    it('should have extract using ->', () => {
      const result = dialect.config.jsonOperators.extract('data', 'name');
      expect(result).toBe("data->'name'");
    });

    it('should have contains using @>', () => {
      const result = dialect.config.jsonOperators.contains('data', '{"key": "value"}');
      expect(result).toBe('data @> \'{"key": "value"}\'');
    });
  });
});

describe('WHERE clause building', () => {
  let dialect: MySQLDialect;

  beforeEach(() => {
    dialect = new MySQLDialect();
  });

  it('should build WHERE with multiple conditions', () => {
    const components: SelectComponents = {
      columns: ['*'],
      from: 'users',
      joins: [],
      where: [
        { type: 'AND', sql: 'active = ?', bindings: [true] },
        { type: 'AND', sql: 'age > ?', bindings: [18] },
        { type: 'OR', sql: 'admin = ?', bindings: [true] },
      ],
      groupBy: [],
      orderBy: [],
    };

    const result = dialect.buildSelect(components);
    expect(result.sql).toContain('WHERE active = ? AND age > ? OR admin = ?');
    expect(result.bindings).toEqual([true, 18, true]);
  });
});

describe('JOIN building', () => {
  let dialect: PostgreSQLDialect;

  beforeEach(() => {
    dialect = new PostgreSQLDialect();
  });

  it('should build LEFT JOIN', () => {
    const components: SelectComponents = {
      columns: ['*'],
      from: 'users',
      joins: [
        {
          type: 'LEFT',
          table: 'profiles',
          condition: 'users.id = profiles.user_id',
          bindings: [],
        },
      ],
      where: [],
      groupBy: [],
      orderBy: [],
    };

    const result = dialect.buildSelect(components);
    expect(result.sql).toContain('LEFT JOIN "profiles"');
  });

  it('should build RIGHT JOIN', () => {
    const components: SelectComponents = {
      columns: ['*'],
      from: 'users',
      joins: [
        {
          type: 'RIGHT',
          table: 'profiles',
          condition: 'users.id = profiles.user_id',
          bindings: [],
        },
      ],
      where: [],
      groupBy: [],
      orderBy: [],
    };

    const result = dialect.buildSelect(components);
    expect(result.sql).toContain('RIGHT JOIN "profiles"');
  });

  it('should build FULL JOIN', () => {
    const components: SelectComponents = {
      columns: ['*'],
      from: 'users',
      joins: [
        {
          type: 'FULL',
          table: 'profiles',
          condition: 'users.id = profiles.user_id',
          bindings: [],
        },
      ],
      where: [],
      groupBy: [],
      orderBy: [],
    };

    const result = dialect.buildSelect(components);
    expect(result.sql).toContain('FULL JOIN "profiles"');
  });

  it('should build JOIN with bindings', () => {
    const components: SelectComponents = {
      columns: ['*'],
      from: 'users',
      joins: [
        {
          type: 'INNER',
          table: 'profiles',
          condition: 'users.id = profiles.user_id AND profiles.type = $1',
          bindings: ['premium'],
        },
      ],
      where: [],
      groupBy: [],
      orderBy: [],
    };

    const result = dialect.buildSelect(components);
    expect(result.bindings).toContain('premium');
  });
});

describe('DialectFactory', () => {
  afterEach(() => {
    DialectFactory.clearCache();
  });

  describe('getDialect', () => {
    it('should return MySQLDialect for mysql', () => {
      const dialect = DialectFactory.getDialect('mysql');
      expect(dialect.name).toBe('mysql');
      expect(dialect).toBeInstanceOf(MySQLDialect);
    });

    it('should return MySQLDialect for mariadb', () => {
      const dialect = DialectFactory.getDialect('mariadb');
      expect(dialect.name).toBe('mysql');
    });

    it('should return PostgreSQLDialect for postgresql', () => {
      const dialect = DialectFactory.getDialect('postgresql');
      expect(dialect.name).toBe('postgresql');
      expect(dialect).toBeInstanceOf(PostgreSQLDialect);
    });

    it('should return PostgreSQLDialect for postgres', () => {
      const dialect = DialectFactory.getDialect('postgres');
      expect(dialect.name).toBe('postgresql');
    });

    it('should cache dialect instances', () => {
      const dialect1 = DialectFactory.getDialect('mysql');
      const dialect2 = DialectFactory.getDialect('mysql');
      expect(dialect1).toBe(dialect2);
    });

    it('should cache different dialects separately', () => {
      const mysql = DialectFactory.getDialect('mysql');
      const postgres = DialectFactory.getDialect('postgresql');
      expect(mysql).not.toBe(postgres);
    });
  });

  describe('createDialect', () => {
    it('should create new MySQLDialect instance', () => {
      const dialect1 = DialectFactory.createDialect('mysql');
      const dialect2 = DialectFactory.createDialect('mysql');
      expect(dialect1).not.toBe(dialect2); // Not cached
      expect(dialect1.name).toBe('mysql');
    });

    it('should create new PostgreSQLDialect instance', () => {
      const dialect = DialectFactory.createDialect('postgresql');
      expect(dialect.name).toBe('postgresql');
    });

    it('should throw for unsupported database type', () => {
      expect(() => DialectFactory.createDialect('sqlite' as any)).toThrow('Unknown database type');
    });
  });

  describe('isSupported', () => {
    it('should return true for supported types', () => {
      expect(DialectFactory.isSupported('mysql')).toBe(true);
      expect(DialectFactory.isSupported('mariadb')).toBe(true);
      expect(DialectFactory.isSupported('postgresql')).toBe(true);
      expect(DialectFactory.isSupported('postgres')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(DialectFactory.isSupported('sqlite')).toBe(false);
      expect(DialectFactory.isSupported('oracle')).toBe(false);
      expect(DialectFactory.isSupported('')).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear cached dialects', () => {
      const dialect1 = DialectFactory.getDialect('mysql');
      DialectFactory.clearCache();
      const dialect2 = DialectFactory.getDialect('mysql');
      expect(dialect1).not.toBe(dialect2);
    });
  });
});
