import { CacheError, withTimeout } from '@db-bridge/core';
import { RedisConnectionManager } from './connection-trait';

export class BasicOperationsTrait extends RedisConnectionManager {
  protected commandTimeout = 5000;

  setCommandTimeout(timeout: number): void {
    this.commandTimeout = timeout;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    this.ensureConnected();
    
    try {
      const fullKey = this.getFullKey(key);
      const value = await withTimeout(
        this.client!.get(fullKey),
        this.commandTimeout,
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

      if (ttl && ttl > 0) {
        await withTimeout(
          this.client!.setex(fullKey, ttl, serialized),
          this.commandTimeout,
        );
      } else {
        await withTimeout(
          this.client!.set(fullKey, serialized),
          this.commandTimeout,
        );
      }

      this.emit('set', { key, ttl });
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
        this.commandTimeout,
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

  async del(key: string): Promise<boolean> {
    return this.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.exists(fullKey),
        this.commandTimeout,
      );

      return result > 0;
    } catch (error) {
      throw new CacheError(`Failed to check existence of key "${key}"`, key, error as Error);
    }
  }

  async ttl(key: string): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const ttl = await withTimeout(
        this.client!.ttl(fullKey),
        this.commandTimeout,
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
        this.commandTimeout,
      );

      return result === 1;
    } catch (error) {
      throw new CacheError(`Failed to set expiry for key "${key}"`, key, error as Error);
    }
  }

  protected serialize<T>(value: T): string {
    try {
      return JSON.stringify(value);
    } catch (error) {
      throw new CacheError('Failed to serialize value', undefined, error as Error);
    }
  }

  protected deserialize<T>(value: string): T {
    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new CacheError('Failed to deserialize value', undefined, error as Error);
    }
  }
}