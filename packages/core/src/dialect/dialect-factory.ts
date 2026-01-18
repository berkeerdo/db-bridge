/**
 * Dialect Factory
 *
 * Creates appropriate SQL dialect based on database type.
 * Implements Factory pattern for clean dialect instantiation.
 */

import { MySQLDialect } from './mysql-dialect';
import { PostgreSQLDialect } from './postgresql-dialect';

import type { SQLDialect } from './sql-dialect';

export type DialectDatabaseType = 'mysql' | 'mariadb' | 'postgresql' | 'postgres';

const dialectCache = new Map<DialectDatabaseType, SQLDialect>();

export class DialectFactory {
  /**
   * Get dialect for database type (cached)
   */
  static getDialect(type: DialectDatabaseType): SQLDialect {
    // Normalize type
    const normalizedType = this.normalizeType(type);

    // Check cache
    if (dialectCache.has(normalizedType)) {
      return dialectCache.get(normalizedType)!;
    }

    // Create dialect
    const dialect = this.createDialect(normalizedType);
    dialectCache.set(normalizedType, dialect);
    return dialect;
  }

  /**
   * Create new dialect instance (not cached)
   */
  static createDialect(type: DialectDatabaseType): SQLDialect {
    const normalizedType = this.normalizeType(type);

    switch (normalizedType) {
      case 'mysql': {
        return new MySQLDialect();
      }
      case 'postgresql': {
        return new PostgreSQLDialect();
      }
      default: {
        throw new Error(`Unsupported database type: ${type}`);
      }
    }
  }

  /**
   * Normalize database type aliases
   */
  private static normalizeType(type: DialectDatabaseType): 'mysql' | 'postgresql' {
    switch (type) {
      case 'mysql':
      case 'mariadb': {
        return 'mysql';
      }
      case 'postgresql':
      case 'postgres': {
        return 'postgresql';
      }
      default: {
        throw new Error(`Unknown database type: ${type}`);
      }
    }
  }

  /**
   * Check if database type is supported
   */
  static isSupported(type: string): type is DialectDatabaseType {
    return ['mysql', 'mariadb', 'postgresql', 'postgres'].includes(type);
  }

  /**
   * Clear dialect cache (useful for testing)
   */
  static clearCache(): void {
    dialectCache.clear();
  }
}
