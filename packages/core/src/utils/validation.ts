import { ValidationError } from '../errors';
import { ConnectionConfig } from '../types';

export function validateConnectionConfig(config: ConnectionConfig): void {
  if (!config) {
    throw new ValidationError('Connection configuration is required');
  }

  if (!config.connectionString) {
    if (!config.host) {
      throw new ValidationError('Host is required when connectionString is not provided', 'host');
    }

    if (!config.database) {
      throw new ValidationError(
        'Database name is required when connectionString is not provided',
        'database',
      );
    }
  }

  if (config.port !== undefined && (typeof config.port !== 'number' || config.port < 1 || config.port > 65535)) {
    throw new ValidationError('Port must be a number between 1 and 65535', 'port');
  }

  if (config.poolSize && (typeof config.poolSize !== 'number' || config.poolSize < 1)) {
    throw new ValidationError('Pool size must be a positive number', 'poolSize');
  }

  if (
    config.connectionTimeout &&
    (typeof config.connectionTimeout !== 'number' || config.connectionTimeout < 0)
  ) {
    throw new ValidationError('Connection timeout must be a non-negative number', 'connectionTimeout');
  }

  if (
    config.idleTimeout &&
    (typeof config.idleTimeout !== 'number' || config.idleTimeout < 0)
  ) {
    throw new ValidationError('Idle timeout must be a non-negative number', 'idleTimeout');
  }
}

export function validateSQL(sql: string): void {
  if (!sql || typeof sql !== 'string') {
    throw new ValidationError('SQL query must be a non-empty string');
  }

  if (sql.trim().length === 0) {
    throw new ValidationError('SQL query cannot be empty');
  }
}

export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== 'string') {
    throw new ValidationError('Table name must be a non-empty string');
  }

  const validTableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!validTableNameRegex.test(tableName)) {
    throw new ValidationError(
      'Table name must start with a letter or underscore and contain only letters, numbers, and underscores',
      'tableName',
    );
  }
}

export function validateColumnName(columnName: string): void {
  if (!columnName || typeof columnName !== 'string') {
    throw new ValidationError('Column name must be a non-empty string');
  }

  const validColumnNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!validColumnNameRegex.test(columnName)) {
    throw new ValidationError(
      'Column name must start with a letter or underscore and contain only letters, numbers, and underscores',
      'columnName',
    );
  }
}