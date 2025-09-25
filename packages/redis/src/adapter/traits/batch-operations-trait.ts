import { CacheError, withTimeout } from '@db-bridge/core';
import { BasicOperationsTrait } from './basic-operations-trait';

export class BatchOperationsTrait extends BasicOperationsTrait {
  async mget<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    this.ensureConnected();

    if (keys.length === 0) {
      return [];
    }

    try {
      const fullKeys = keys.map((key) => this.getFullKey(key));
      const values = await withTimeout(
        this.client!.mget(...fullKeys),
        this.commandTimeout,
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

        if (ttl && ttl > 0) {
          pipeline.setex(fullKey, ttl, serialized);
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

  async clear(): Promise<void> {
    this.ensureConnected();

    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.scanKeys(pattern);

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

  async keys(pattern = '*'): Promise<string[]> {
    this.ensureConnected();

    try {
      const fullPattern = pattern.startsWith(this.config.keyPrefix!)
        ? pattern
        : this.getFullKey(pattern);

      const keys = await withTimeout(
        this.scanKeys(fullPattern),
        this.commandTimeout * 5,
      );

      return keys.map((key) => key.replace(this.config.keyPrefix!, ''));
    } catch (error) {
      throw new CacheError('Failed to get keys', undefined, error as Error);
    }
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