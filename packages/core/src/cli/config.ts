/**
 * CLI Configuration
 * Load and validate db-bridge.config.ts
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface DBBridgeConfig {
  /** Database connection settings */
  connection: {
    dialect: 'mysql' | 'postgresql';
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl?: boolean | object;
  };

  /** Migration settings */
  migrations?: {
    /** Directory containing migration files */
    directory?: string;
    /** Migration table name */
    tableName?: string;
    /** Lock table name */
    lockTableName?: string;
    /** Prefix for migration filenames (e.g., 'auth' -> auth_20250119_xxx.ts) */
    prefix?: string;
  };

  /** Seed settings */
  seeds?: {
    /** Directory containing seed files */
    directory?: string;
    /** Prefix for seed filenames (e.g., 'auth' -> auth_01_users.ts) */
    prefix?: string;
  };
}

/**
 * Define configuration helper
 */
export function defineConfig(config: DBBridgeConfig): DBBridgeConfig {
  return config;
}

/**
 * Default config file names to search for
 */
const CONFIG_FILES = [
  'db-bridge.config.ts',
  'db-bridge.config.js',
  'db-bridge.config.mjs',
  'dbbridge.config.ts',
  'dbbridge.config.js',
];

/**
 * Load configuration from file
 */
export async function loadConfig(cwd: string = process.cwd()): Promise<DBBridgeConfig> {
  // Try to find config file
  let configPath: string | null = null;

  for (const filename of CONFIG_FILES) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      configPath = fullPath;
      break;
    }
  }

  if (!configPath) {
    throw new Error(`Configuration file not found. Create one of: ${CONFIG_FILES.join(', ')}`);
  }

  try {
    const fileUrl = pathToFileURL(configPath).href;
    const module = await import(fileUrl);
    const config = module.default || module;

    validateConfig(config);
    return applyDefaults(config);
  } catch (error) {
    if ((error as Error).message.includes('Configuration file not found')) {
      throw error;
    }
    throw new Error(`Failed to load config from ${configPath}: ${(error as Error).message}`);
  }
}

/**
 * Validate configuration
 */
function validateConfig(config: unknown): asserts config is DBBridgeConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  const cfg = config as Record<string, unknown>;
  const connection = cfg['connection'];

  if (!connection || typeof connection !== 'object') {
    throw new Error('Configuration must have a "connection" object');
  }

  const conn = connection as Record<string, unknown>;
  const dialect = conn['dialect'];
  const host = conn['host'];
  const database = conn['database'];

  if (!['mysql', 'postgresql'].includes(dialect as string)) {
    throw new Error('connection.dialect must be "mysql" or "postgresql"');
  }

  if (!host || typeof host !== 'string') {
    throw new Error('connection.host is required');
  }

  if (!database || typeof database !== 'string') {
    throw new Error('connection.database is required');
  }
}

/**
 * Apply default values
 */
function applyDefaults(config: DBBridgeConfig): DBBridgeConfig {
  const defaultPort = config.connection.dialect === 'mysql' ? 3306 : 5432;

  return {
    ...config,
    connection: {
      ...config.connection,
      port: config.connection.port ?? defaultPort,
      user: config.connection.user ?? 'root',
      password: config.connection.password ?? '',
    },
    migrations: {
      directory: './src/migrations',
      tableName: 'db_migrations',
      lockTableName: 'db_migrations_lock',
      ...config.migrations,
    },
    seeds: {
      directory: './src/seeds',
      ...config.seeds,
    },
  };
}
