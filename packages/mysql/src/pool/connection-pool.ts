import { ConnectionError } from '@db-bridge/core';
import * as mysql from 'mysql2/promise';

import type { PoolStats } from '@db-bridge/core';

export class MySQLConnectionPool {
  private pool?: mysql.Pool;

  constructor(private options: mysql.ConnectionOptions) {}

  async initialize(): Promise<void> {
    try {
      this.pool = mysql.createPool(this.options);

      const connection = await this.pool.getConnection();
      await connection.ping();
      connection.release();
    } catch (error) {
      throw new ConnectionError('Failed to initialize MySQL connection pool', error as Error);
    }
  }

  async getConnection(): Promise<mysql.PoolConnection> {
    if (!this.pool) {
      throw new ConnectionError('Connection pool not initialized');
    }

    try {
      return await this.pool.getConnection();
    } catch (error) {
      throw new ConnectionError('Failed to get connection from pool', error as Error);
    }
  }

  async end(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  getStats(): PoolStats {
    if (!this.pool) {
      return {
        total: 0,
        idle: 0,
        active: 0,
        waiting: 0,
      };
    }

    // mysql2 doesn't expose pool stats directly, so we use internal properties
    // These may change in future versions of mysql2
    const pool = this.pool as any;
    const poolConfig = pool.config;

    // Get connection limit from config
    const connectionLimit = poolConfig?.connectionLimit || 10;

    // Try to access internal pool state
    const allConnections = pool._allConnections || [];
    const freeConnections = pool._freeConnections || [];
    const connectionQueue = pool._connectionQueue || [];

    return {
      total: connectionLimit,
      idle: freeConnections.length,
      active: allConnections.length - freeConnections.length,
      waiting: connectionQueue.length,
    };
  }
}
