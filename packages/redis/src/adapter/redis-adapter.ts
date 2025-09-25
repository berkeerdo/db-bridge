import Redis, { RedisOptions } from 'ioredis';
import {
  CacheAdapter,
  CacheError,
  ConnectionError,
  Logger,
  withTimeout,
} from '@db-bridge/core';
import { EventEmitter } from 'eventemitter3';
import { RedisCommands } from '../commands/redis-commands';

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

export class RedisAdapter extends EventEmitter implements CacheAdapter {
  private client?: Redis;
  private isConnected = false;
  private _commands?: RedisCommands;
  private readonly options: Omit<Required<RedisAdapterOptions>, 'logger' | 'retryOptions'> & { 
    logger?: Logger;
    retryOptions: {
      maxRetries: number;
      retryDelay: number;
    };
  };

  constructor(options: RedisAdapterOptions = {}) {
    super();
    
    this.options = {
      redis: options.redis || {},
      keyPrefix: options.keyPrefix || 'db-bridge:',
      ttl: options.ttl || 3600,
      logger: options.logger,
      enableCompression: options.enableCompression || false,
      connectionTimeout: options.connectionTimeout || 10000,
      commandTimeout: options.commandTimeout || 5000,
      retryOptions: {
        maxRetries: options.retryOptions?.maxRetries ?? 3,
        retryDelay: options.retryOptions?.retryDelay ?? 1000,
      },
    } as any;
  }

  async connect(config?: RedisOptions): Promise<void> {
    if (this.isConnected) {
      return;
    }

    const redisConfig: RedisOptions = {
      ...this.options.redis,
      ...config,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: (times: number) => {
        const retryOptions = this.options.retryOptions!;
        if (times > retryOptions.maxRetries) {
          return null;
        }
        return Math.min(times * retryOptions.retryDelay, 5000);
      },
    };

    this.client = new Redis(redisConfig);

    this.client.on('error', (error: Error) => {
      this.options.logger?.error('Redis client error', error);
      this.emit('error', error);
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.options.logger?.info('Connected to Redis');
      this.emit('connect');
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.options.logger?.info('Disconnected from Redis');
      this.emit('disconnect');
    });

    try {
      await withTimeout(
        this.client.connect(),
        this.options.connectionTimeout,
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

  async get<T = unknown>(key: string): Promise<T | null> {
    this.ensureConnected();
    
    try {
      const fullKey = this.getFullKey(key);
      const value = await withTimeout(
        this.client!.get(fullKey),
        this.options.commandTimeout,
      );

      if (!value) {
        return null;
      }

      return this.deserialize<T>(value);
    } catch (error) {
      throw new CacheError(`Failed to get key "${key}"`, key, error as Error);
    }
  }

  async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const serialized = this.serialize(value);
      const expiry = ttl || this.options.ttl;

      if (expiry > 0) {
        await withTimeout(
          this.client!.setex(fullKey, expiry, serialized),
          this.options.commandTimeout,
        );
      } else {
        await withTimeout(
          this.client!.set(fullKey, serialized),
          this.options.commandTimeout,
        );
      }

      this.emit('set', { key, ttl: expiry });
    } catch (error) {
      throw new CacheError(`Failed to set key "${key}"`, key, error as Error);
    }
  }

  async delete(key: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.del(fullKey),
        this.options.commandTimeout,
      );

      const deleted = result > 0;
      if (deleted) {
        this.emit('delete', { key });
      }

      return deleted;
    } catch (error) {
      throw new CacheError(`Failed to delete key "${key}"`, key, error as Error);
    }
  }

  async exists(key: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.exists(fullKey),
        this.options.commandTimeout,
      );

      return result > 0;
    } catch (error) {
      throw new CacheError(`Failed to check existence of key "${key}"`, key, error as Error);
    }
  }

  async clear(): Promise<void> {
    this.ensureConnected();

    try {
      const pattern = `${this.options.keyPrefix}*`;
      const keys = await this.keys(pattern);

      if (keys.length > 0) {
        const pipeline = this.client!.pipeline();
        keys.forEach((key) => pipeline.del(key));
        await pipeline.exec();
      }

      this.emit('clear', { count: keys.length });
    } catch (error) {
      throw new CacheError('Failed to clear cache', undefined, error as Error);
    }
  }

  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    this.ensureConnected();

    if (keys.length === 0) {
      return [];
    }

    try {
      const fullKeys = keys.map((key) => this.getFullKey(key));
      const values = await withTimeout(
        this.client!.mget(...fullKeys),
        this.options.commandTimeout,
      );

      return values.map((value) => {
        if (!value) {
          return null;
        }
        return this.deserialize<T>(value);
      });
    } catch (error) {
      throw new CacheError('Failed to get multiple keys', undefined, error as Error);
    }
  }

  async mset<T = unknown>(
    items: Array<{ key: string; value: T; ttl?: number }>,
  ): Promise<void> {
    this.ensureConnected();

    if (items.length === 0) {
      return;
    }

    try {
      const pipeline = this.client!.pipeline();

      items.forEach(({ key, value, ttl }) => {
        const fullKey = this.getFullKey(key);
        const serialized = this.serialize(value);
        const expiry = ttl || this.options.ttl;

        if (expiry > 0) {
          pipeline.setex(fullKey, expiry, serialized);
        } else {
          pipeline.set(fullKey, serialized);
        }
      });

      await pipeline.exec();
      this.emit('mset', { count: items.length });
    } catch (error) {
      throw new CacheError('Failed to set multiple keys', undefined, error as Error);
    }
  }

  async keys(pattern = '*'): Promise<string[]> {
    this.ensureConnected();

    try {
      const fullPattern = pattern.startsWith(this.options.keyPrefix)
        ? pattern
        : this.getFullKey(pattern);

      const keys = await withTimeout(
        this.scanKeys(fullPattern),
        this.options.commandTimeout * 5,
      );

      return keys.map((key) => key.replace(this.options.keyPrefix, ''));
    } catch (error) {
      throw new CacheError('Failed to get keys', undefined, error as Error);
    }
  }

  async ttl(key: string): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const ttl = await withTimeout(
        this.client!.ttl(fullKey),
        this.options.commandTimeout,
      );

      return ttl >= 0 ? ttl : -1;
    } catch (error) {
      throw new CacheError(`Failed to get TTL for key "${key}"`, key, error as Error);
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.expire(fullKey, ttl),
        this.options.commandTimeout,
      );

      return result === 1;
    } catch (error) {
      throw new CacheError(`Failed to set expiry for key "${key}"`, key, error as Error);
    }
  }

  async increment(key: string, value = 1): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.incrby(fullKey, value),
        this.options.commandTimeout,
      );

      return result;
    } catch (error) {
      throw new CacheError(`Failed to increment key "${key}"`, key, error as Error);
    }
  }

  /**
   * Alias for delete() to match Redis command naming
   */
  async del(key: string): Promise<boolean> {
    return this.delete(key);
  }

  async decrement(key: string, value = 1): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.decrby(fullKey, value),
        this.options.commandTimeout,
      );

      return result;
    } catch (error) {
      throw new CacheError(`Failed to decrement key "${key}"`, key, error as Error);
    }
  }

  private ensureConnected(): void {
    if (!this.client || !this.isConnected) {
      throw new ConnectionError('Redis client not connected');
    }
  }

  get commands(): RedisCommands {
    if (!this._commands) {
      this._commands = new RedisCommands(this);
    }
    return this._commands;
  }

  getClient(): Redis | undefined {
    return this.client;
  }

  getFullKey(key: string): string {
    return `${this.options.keyPrefix}${key}`;
  }

  private serialize<T>(value: T): string {
    try {
      const json = JSON.stringify(value);
      
      if (this.options.enableCompression && json.length > 1024) {
        return this.compress(json);
      }
      
      return json;
    } catch (error) {
      throw new CacheError('Failed to serialize value', undefined, error as Error);
    }
  }

  private deserialize<T>(value: string): T {
    try {
      if (this.options.enableCompression && this.isCompressed(value)) {
        value = this.decompress(value);
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      throw new CacheError('Failed to deserialize value', undefined, error as Error);
    }
  }

  private compress(data: string): string {
    return data;
  }

  private decompress(data: string): string {
    return data;
  }

  private isCompressed(_data: string): boolean {
    return false;
  }

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, scannedKeys] = await this.client!.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        1000,
      );
      
      cursor = nextCursor;
      keys.push(...scannedKeys);
    } while (cursor !== '0');

    return keys;
  }
}