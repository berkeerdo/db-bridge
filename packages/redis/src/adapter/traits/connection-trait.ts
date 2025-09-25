import Redis, { RedisOptions } from 'ioredis';
import { EventEmitter } from 'eventemitter3';
import { ConnectionError, withTimeout } from '@db-bridge/core';

export interface ConnectionConfig {
  redis?: RedisOptions;
  keyPrefix?: string;
  connectionTimeout?: number;
  retryOptions?: {
    maxRetries?: number;
    retryDelay?: number;
  };
}

export class RedisConnectionManager extends EventEmitter {
  protected client?: Redis;
  protected isConnected = false;
  protected config: ConnectionConfig;

  constructor(config: ConnectionConfig = {}) {
    super();
    this.config = {
      keyPrefix: config.keyPrefix || 'db-bridge:',
      connectionTimeout: config.connectionTimeout || 10000,
      retryOptions: {
        maxRetries: config.retryOptions?.maxRetries ?? 3,
        retryDelay: config.retryOptions?.retryDelay ?? 1000,
      },
      redis: config.redis || {},
    };
  }

  async connect(overrideConfig?: RedisOptions): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const redisConfig: RedisOptions = {
      ...this.config.redis,
      ...overrideConfig,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => {
        if (times > this.config.retryOptions!.maxRetries!) {
          return null;
        }
        return Math.min(times * this.config.retryOptions!.retryDelay!, 5000);
      },
    };

    this.client = new Redis(redisConfig);
    this.setupEventHandlers();

    try {
      await withTimeout(
        this.client.connect(),
        this.config.connectionTimeout!,
        'Redis connection timeout',
      );
    } catch (error) {
      throw new ConnectionError('Failed to connect to Redis', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client && this.isConnected) {
      await this.client.quit();
      this.client = undefined;
      this.isConnected = false;
    }
  }

  getClient(): Redis | undefined {
    return this.client;
  }

  ensureConnected(): void {
    if (!this.client || !this.isConnected) {
      throw new ConnectionError('Redis client not connected');
    }
  }

  getFullKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.emit('connect');
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.emit('disconnect');
    });
  }
}