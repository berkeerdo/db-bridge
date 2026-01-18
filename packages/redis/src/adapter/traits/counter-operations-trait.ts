import { CacheError, withTimeout } from '@db-bridge/core';

import { BatchOperationsTrait } from './batch-operations-trait';

export class CounterOperationsTrait extends BatchOperationsTrait {
  async increment(key: string, value = 1): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(this.client!.incrby(fullKey, value), this.commandTimeout);

      return result;
    } catch (error) {
      throw new CacheError(`Failed to increment key "${key}"`, key, error as Error);
    }
  }

  async decrement(key: string, value = 1): Promise<number> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(this.client!.decrby(fullKey, value), this.commandTimeout);

      return result;
    } catch (error) {
      throw new CacheError(`Failed to decrement key "${key}"`, key, error as Error);
    }
  }

  async incr(key: string): Promise<number> {
    return this.increment(key, 1);
  }

  async decr(key: string): Promise<number> {
    return this.decrement(key, 1);
  }

  async incrby(key: string, value: number): Promise<number> {
    return this.increment(key, value);
  }

  async decrby(key: string, value: number): Promise<number> {
    return this.decrement(key, value);
  }

  async incrbyfloat(key: string, value: number): Promise<string> {
    this.ensureConnected();

    try {
      const fullKey = this.getFullKey(key);
      const result = await withTimeout(
        this.client!.incrbyfloat(fullKey, value),
        this.commandTimeout,
      );

      return result;
    } catch (error) {
      throw new CacheError(`Failed to increment float key "${key}"`, key, error as Error);
    }
  }
}
