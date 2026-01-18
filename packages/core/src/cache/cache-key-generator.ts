import { createHash } from 'node:crypto';

/**
 * Cache Key Pattern Types
 */
export type CacheKeyPattern =
  | 'table' // table:users
  | 'table:id' // table:users:123
  | 'table:query' // table:users:query:abc123
  | 'table:field' // table:users:email:test@test.com
  | 'custom'; // custom pattern

/**
 * Cache Key Options
 */
export interface CacheKeyOptions {
  /** Namespace prefix (e.g., 'myapp', 'api') */
  namespace?: string;
  /** Table/collection name */
  table?: string;
  /** Primary key or ID */
  id?: string | number;
  /** Field name for field-based keys */
  field?: string;
  /** Field value */
  value?: unknown;
  /** SQL query (will be hashed) */
  query?: string;
  /** Query parameters */
  params?: unknown[];
  /** Custom key parts */
  parts?: string[];
  /** Tags for grouping (for bulk invalidation) */
  tags?: string[];
}

/**
 * Industry-standard Cache Key Generator
 *
 * Generates consistent, collision-free cache keys with support for:
 * - Namespacing
 * - Table-based keys
 * - Query hashing
 * - Tag-based grouping
 *
 * @example
 * ```typescript
 * const generator = new CacheKeyGenerator({ namespace: 'myapp' });
 *
 * // Simple table key
 * generator.forTable('users').build();
 * // => 'myapp:table:users'
 *
 * // Table with ID
 * generator.forTable('users').withId(123).build();
 * // => 'myapp:table:users:id:123'
 *
 * // Query-based key
 * generator.forQuery('SELECT * FROM users WHERE age > ?', [18]).build();
 * // => 'myapp:query:a1b2c3d4'
 *
 * // Field-based key
 * generator.forTable('users').withField('email', 'test@test.com').build();
 * // => 'myapp:table:users:field:email:098f6bcd'
 * ```
 */
export class CacheKeyGenerator {
  private readonly namespace: string;
  private readonly separator: string;
  private readonly hashAlgorithm: string;
  private readonly hashLength: number;

  private currentOptions: CacheKeyOptions = {};

  constructor(
    options: {
      namespace?: string;
      separator?: string;
      hashAlgorithm?: string;
      hashLength?: number;
    } = {},
  ) {
    this.namespace = options.namespace || 'cache';
    this.separator = options.separator || ':';
    this.hashAlgorithm = options.hashAlgorithm || 'sha256';
    this.hashLength = options.hashLength || 8;
  }

  /**
   * Start building a key for a table
   */
  forTable(table: string): this {
    this.currentOptions = { table };
    return this;
  }

  /**
   * Add ID to the key
   */
  withId(id: string | number): this {
    this.currentOptions.id = id;
    return this;
  }

  /**
   * Add field-based lookup
   */
  withField(field: string, value: unknown): this {
    this.currentOptions.field = field;
    this.currentOptions.value = value;
    return this;
  }

  /**
   * Add tags for bulk invalidation
   */
  withTags(...tags: string[]): this {
    this.currentOptions.tags = tags;
    return this;
  }

  /**
   * Create key for a SQL query
   */
  forQuery(sql: string, params?: unknown[]): this {
    this.currentOptions = { query: sql, params };
    return this;
  }

  /**
   * Create custom key with parts
   */
  forCustom(...parts: string[]): this {
    this.currentOptions = { parts };
    return this;
  }

  /**
   * Set namespace for this key
   */
  inNamespace(namespace: string): this {
    this.currentOptions.namespace = namespace;
    return this;
  }

  /**
   * Build the final cache key
   */
  build(): string {
    const parts: string[] = [];
    const opts = this.currentOptions;
    const ns = opts.namespace || this.namespace;

    // Add namespace
    parts.push(ns);

    // Build key based on options
    if (opts.query) {
      // Query-based key
      parts.push('query');
      parts.push(this.hashQuery(opts.query, opts.params));
    } else if (opts.table) {
      // Table-based key
      parts.push('table', opts.table);

      if (opts.id !== undefined) {
        parts.push('id');
        parts.push(String(opts.id));
      }

      if (opts.field && opts.value !== undefined) {
        parts.push('field', opts.field);
        parts.push(this.hashValue(opts.value));
      }
    } else if (opts.parts && opts.parts.length > 0) {
      // Custom parts
      parts.push(...opts.parts);
    }

    // Reset for next build
    const key = parts.join(this.separator);
    this.currentOptions = {};

    return key;
  }

  /**
   * Build key and return with tags
   */
  buildWithTags(): { key: string; tags: string[] } {
    const tags = this.currentOptions.tags || [];
    const opts = this.currentOptions;

    // Auto-generate table tag
    if (opts.table && !tags.includes(`table:${opts.table}`)) {
      tags.push(`table:${opts.table}`);
    }

    return {
      key: this.build(),
      tags,
    };
  }

  /**
   * Generate key for table:id pattern
   */
  tableId(table: string, id: string | number): string {
    return this.forTable(table).withId(id).build();
  }

  /**
   * Generate key for table:field:value pattern
   */
  tableField(table: string, field: string, value: unknown): string {
    return this.forTable(table).withField(field, value).build();
  }

  /**
   * Generate key from SQL query
   */
  query(sql: string, params?: unknown[]): string {
    return this.forQuery(sql, params).build();
  }

  /**
   * Generate wildcard pattern for bulk operations
   */
  pattern(table: string, pattern: '*' | 'id:*' | 'field:*' = '*'): string {
    const ns = this.namespace;
    if (pattern === '*') {
      return `${ns}${this.separator}table${this.separator}${table}${this.separator}*`;
    }
    return `${ns}${this.separator}table${this.separator}${table}${this.separator}${pattern}`;
  }

  /**
   * Generate tag key
   */
  tag(tagName: string): string {
    return `${this.namespace}${this.separator}tag${this.separator}${tagName}`;
  }

  /**
   * Hash a SQL query with params
   */
  private hashQuery(sql: string, params?: unknown[]): string {
    const content = JSON.stringify({ sql: sql.trim(), params: params || [] });
    return this.hash(content);
  }

  /**
   * Hash a value
   */
  private hashValue(value: unknown): string {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    return this.hash(content);
  }

  /**
   * Create hash of content
   */
  private hash(content: string): string {
    return createHash(this.hashAlgorithm)
      .update(content)
      .digest('hex')
      .slice(0, Math.max(0, this.hashLength));
  }

  /**
   * Create a new generator with different namespace
   */
  withNamespace(namespace: string): CacheKeyGenerator {
    return new CacheKeyGenerator({
      namespace,
      separator: this.separator,
      hashAlgorithm: this.hashAlgorithm,
      hashLength: this.hashLength,
    });
  }
}

/**
 * Default cache key generator instance
 */
export const cacheKey = new CacheKeyGenerator();
