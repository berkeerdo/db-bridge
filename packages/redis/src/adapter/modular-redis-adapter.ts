import { CounterOperationsTrait } from './traits/counter-operations-trait';
import { RedisCommands } from '../commands/redis-commands';

import type { CacheAdapter, Logger } from '@db-bridge/core';
import type { RedisOptions } from 'ioredis';

export interface RedisAdapterOptions {
  redis?: RedisOptions;
  keyPrefix?: string;
  ttl?: number;
  logger?: Logger;
  enableCompression?: boolean;
  connectionTimeout?: number;
  commandTimeout?: number;
  retryOptions?: {
    maxRetries?: number;
    retryDelay?: number;
  };
}

export class ModularRedisAdapter extends CounterOperationsTrait implements CacheAdapter {
  private _commands?: RedisCommands;
  private defaultTtl: number;
  private logger?: Logger;
  private enableCompression: boolean;

  constructor(options: RedisAdapterOptions = {}) {
    super({
      redis: options.redis,
      keyPrefix: options.keyPrefix,
      connectionTimeout: options.connectionTimeout,
      retryOptions: options.retryOptions,
    });

    this.defaultTtl = options.ttl || 3600;
    this.logger = options.logger;
    this.enableCompression = options.enableCompression || false;

    if (options.commandTimeout) {
      this.setCommandTimeout(options.commandTimeout);
    }

    this.setupLogging();
  }

  override async connect(config?: RedisOptions): Promise<void> {
    await super.connect(config);
    this.logger?.info('Connected to Redis');
  }

  override async disconnect(): Promise<void> {
    await super.disconnect();
    this.logger?.info('Disconnected from Redis');
  }

  override async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    const effectiveTtl = ttl === undefined ? this.defaultTtl : ttl;
    await super.set(key, value, effectiveTtl);
  }

  get commands(): RedisCommands {
    if (!this._commands) {
      this._commands = new RedisCommands(this as any);
    }
    return this._commands;
  }

  protected override serialize<T>(value: T): string {
    try {
      const json = super.serialize(value);

      if (this.enableCompression && json.length > 1024) {
        return this.compress(json);
      }

      return json;
    } catch (error) {
      this.logger?.error('Serialization error', error as Error);
      throw error;
    }
  }

  protected override deserialize<T>(value: string): T {
    try {
      if (this.enableCompression && this.isCompressed(value)) {
        value = this.decompress(value);
      }

      return super.deserialize<T>(value);
    } catch (error) {
      this.logger?.error('Deserialization error', error as Error);
      throw error;
    }
  }

  private compress(data: string): string {
    // Placeholder for compression logic
    return data;
  }

  private decompress(data: string): string {
    // Placeholder for decompression logic
    return data;
  }

  private isCompressed(_data: string): boolean {
    // Placeholder for compression detection
    return false;
  }

  private setupLogging(): void {
    if (!this.logger) {
      return;
    }

    this.on('error', (error: Error) => {
      this.logger?.error('Redis client error', error);
    });

    this.on('connect', () => {
      this.logger?.debug('Redis connected');
    });

    this.on('disconnect', () => {
      this.logger?.debug('Redis disconnected');
    });

    this.on('set', ({ key, ttl }) => {
      this.logger?.debug('Cache set', { key, ttl });
    });

    this.on('delete', ({ key }) => {
      this.logger?.debug('Cache delete', { key });
    });

    this.on('clear', ({ count }) => {
      this.logger?.debug('Cache cleared', { count });
    });

    this.on('mset', ({ count }) => {
      this.logger?.debug('Multiple cache set', { count });
    });
  }
}
