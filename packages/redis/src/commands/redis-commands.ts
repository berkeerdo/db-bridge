import type { RedisAdapter } from '../adapter/redis-adapter';

export class RedisCommands {
  constructor(private adapter: RedisAdapter) {}

  private get client() {
    const client = this.adapter.getClient();
    if (!client) {
      throw new Error('Redis client not connected');
    }
    return client;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const result = await this.client.hget(this.adapter.getFullKey(key), field);
    return result;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    const result = await this.client.hset(this.adapter.getFullKey(key), field, value);
    return result;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const result = await this.client.hgetall(this.adapter.getFullKey(key));
    return result;
  }

  async hmset(key: string, data: Record<string, string>): Promise<string> {
    const result = await this.client.hmset(this.adapter.getFullKey(key), data);
    return result;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const result = await this.client.hdel(this.adapter.getFullKey(key), ...fields);
    return result;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.client.lpush(this.adapter.getFullKey(key), ...values);
    return result;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const result = await this.client.rpush(this.adapter.getFullKey(key), ...values);
    return result;
  }

  async lpop(key: string): Promise<string | null> {
    const result = await this.client.lpop(this.adapter.getFullKey(key));
    return result;
  }

  async rpop(key: string): Promise<string | null> {
    const result = await this.client.rpop(this.adapter.getFullKey(key));
    return result;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const result = await this.client.lrange(this.adapter.getFullKey(key), start, stop);
    return result;
  }

  async llen(key: string): Promise<number> {
    const result = await this.client.llen(this.adapter.getFullKey(key));
    return result;
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const result = await this.client.sadd(this.adapter.getFullKey(key), ...members);
    return result;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const result = await this.client.srem(this.adapter.getFullKey(key), ...members);
    return result;
  }

  async smembers(key: string): Promise<string[]> {
    const result = await this.client.smembers(this.adapter.getFullKey(key));
    return result;
  }

  async sismember(key: string, member: string): Promise<number> {
    const result = await this.client.sismember(this.adapter.getFullKey(key), member);
    return result;
  }

  async scard(key: string): Promise<number> {
    const result = await this.client.scard(this.adapter.getFullKey(key));
    return result;
  }

  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    const result = await this.client.zadd(this.adapter.getFullKey(key), ...args);
    return result;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const result = await this.client.zrem(this.adapter.getFullKey(key), ...members);
    return result;
  }

  async zrange(key: string, start: number, stop: number, withScores?: boolean): Promise<string[]> {
    if (withScores) {
      return this.client.zrange(this.adapter.getFullKey(key), start, stop, 'WITHSCORES');
    }
    return this.client.zrange(this.adapter.getFullKey(key), start, stop);
  }

  async zrevrange(
    key: string,
    start: number,
    stop: number,
    withScores?: boolean,
  ): Promise<string[]> {
    if (withScores) {
      return this.client.zrevrange(this.adapter.getFullKey(key), start, stop, 'WITHSCORES');
    }
    return this.client.zrevrange(this.adapter.getFullKey(key), start, stop);
  }

  async zcard(key: string): Promise<number> {
    const result = await this.client.zcard(this.adapter.getFullKey(key));
    return result;
  }

  async publish(channel: string, message: string): Promise<number> {
    const result = await this.client.publish(channel, message);
    return result;
  }

  async subscribe(
    channels: string[],
    callback: (channel: string, message: string) => void,
  ): Promise<void> {
    const subscriber = this.client.duplicate();

    subscriber.on('message', callback);

    await subscriber.subscribe(...channels);
  }

  async unsubscribe(channels?: string[]): Promise<void> {
    if (channels) {
      await this.client.unsubscribe(...channels);
    } else {
      await this.client.unsubscribe();
    }
  }
}
