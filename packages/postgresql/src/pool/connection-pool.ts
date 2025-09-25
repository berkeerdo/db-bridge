import { Pool, PoolClient, PoolConfig } from 'pg';
import { ConnectionError, PoolStats } from '@db-bridge/core';

export class PostgreSQLConnectionPool {
  private pool?: Pool;

  constructor(private config: PoolConfig) {}

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool(this.config);
      
      this.pool.on('error', (err) => {
        console.error('Unexpected error on idle PostgreSQL client', err);
      });

      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
    } catch (error) {
      throw new ConnectionError('Failed to initialize PostgreSQL connection pool', error as Error);
    }
  }

  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new ConnectionError('Connection pool not initialized');
    }

    try {
      return await this.pool.connect();
    } catch (error) {
      throw new ConnectionError('Failed to get client from pool', error as Error);
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

    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      active: this.pool.totalCount - this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}