import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RedisAdapter } from '@db-bridge/redis';
import { ConnectionConfig } from '@db-bridge/core';

describe('Redis Integration Tests', () => {
  let adapter: RedisAdapter;
  const testConfig: ConnectionConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DATABASE || '0')
  };

  beforeAll(async () => {
    adapter = new RedisAdapter();
    
    try {
      await adapter.connect(testConfig);
      
      // Clear test database
      await adapter.flushdb();
    } catch (error) {
      console.warn('Redis integration test setup failed:', error);
      console.warn('Skipping Redis integration tests. Make sure Redis is running.');
    }
  });

  afterAll(async () => {
    if (adapter) {
      try {
        // Clean up test data
        await adapter.flushdb();
        await adapter.disconnect();
      } catch (error) {
        console.warn('Redis cleanup failed:', error);
      }
    }
  });

  it('should connect to Redis database', async () => {
    if (!adapter) return;
    
    expect(adapter).toBeDefined();
    
    // Test ping
    const pingResult = await adapter.ping();
    expect(pingResult).toBe('PONG');
  });

  it('should perform basic string operations', async () => {
    if (!adapter) return;

    // Set and get string
    await adapter.set('test:string', 'hello world');
    const value = await adapter.get('test:string');
    expect(value).toBe('hello world');

    // Set with TTL
    await adapter.set('test:ttl', 'expires soon', 2);
    const ttlValue = await adapter.get('test:ttl');
    expect(ttlValue).toBe('expires soon');

    const ttl = await adapter.ttl('test:ttl');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(2);

    // Delete
    const deleted = await adapter.delete('test:string');
    expect(deleted).toBe(true);

    const deletedValue = await adapter.get('test:string');
    expect(deletedValue).toBeNull();
  });

  it('should handle JSON objects', async () => {
    if (!adapter) return;

    const testObject = {
      id: 1,
      name: 'Test User',
      metadata: { role: 'admin', permissions: ['read', 'write'] }
    };

    await adapter.set('test:object', testObject);
    const retrievedObject = await adapter.get('test:object');
    expect(retrievedObject).toEqual(testObject);
  });

  it('should perform hash operations', async () => {
    if (!adapter) return;

    // Set hash fields
    await adapter.hset('test:hash', 'field1', 'value1');
    await adapter.hset('test:hash', 'field2', 'value2');

    // Get single field
    const field1 = await adapter.hget('test:hash', 'field1');
    expect(field1).toBe('value1');

    // Get all fields
    const allFields = await adapter.hgetall('test:hash');
    expect(allFields).toEqual({
      field1: 'value1',
      field2: 'value2'
    });

    // Check field existence
    const exists = await adapter.hexists('test:hash', 'field1');
    expect(exists).toBe(true);

    const notExists = await adapter.hexists('test:hash', 'field3');
    expect(notExists).toBe(false);

    // Delete field
    const deleted = await adapter.hdel('test:hash', 'field1');
    expect(deleted).toBe(1);

    const afterDelete = await adapter.hget('test:hash', 'field1');
    expect(afterDelete).toBeNull();
  });

  it('should perform list operations', async () => {
    if (!adapter) return;

    // Push to list
    await adapter.lpush('test:list', 'item1');
    await adapter.lpush('test:list', 'item2');
    await adapter.rpush('test:list', 'item3');

    // Get list length
    const length = await adapter.llen('test:list');
    expect(length).toBe(3);

    // Get range
    const range = await adapter.lrange('test:list', 0, -1);
    expect(range).toEqual(['item2', 'item1', 'item3']);

    // Pop from list
    const leftPop = await adapter.lpop('test:list');
    expect(leftPop).toBe('item2');

    const rightPop = await adapter.rpop('test:list');
    expect(rightPop).toBe('item3');

    const finalLength = await adapter.llen('test:list');
    expect(finalLength).toBe(1);
  });

  it('should perform set operations', async () => {
    if (!adapter) return;

    // Add members to set
    await adapter.sadd('test:set', 'member1');
    await adapter.sadd('test:set', 'member2');
    await adapter.sadd('test:set', 'member1'); // Duplicate should be ignored

    // Check set size
    const size = await adapter.scard('test:set');
    expect(size).toBe(2);

    // Check membership
    const isMember = await adapter.sismember('test:set', 'member1');
    expect(isMember).toBe(true);

    const notMember = await adapter.sismember('test:set', 'member3');
    expect(notMember).toBe(false);

    // Get all members
    const members = await adapter.smembers('test:set');
    expect(members).toHaveLength(2);
    expect(members).toContain('member1');
    expect(members).toContain('member2');

    // Remove member
    const removed = await adapter.srem('test:set', 'member1');
    expect(removed).toBe(1);

    const finalSize = await adapter.scard('test:set');
    expect(finalSize).toBe(1);
  });

  it('should perform sorted set operations', async () => {
    if (!adapter) return;

    // Add members with scores
    await adapter.zadd('test:zset', 1, 'first');
    await adapter.zadd('test:zset', 2, 'second');
    await adapter.zadd('test:zset', 3, 'third');

    // Get range by rank
    const range = await adapter.zrange('test:zset', 0, -1);
    expect(range).toEqual(['first', 'second', 'third']);

    // Get range with scores
    const rangeWithScores = await adapter.zrangeWithScores('test:zset', 0, -1);
    expect(rangeWithScores).toHaveLength(3);
    expect(rangeWithScores[0]).toEqual(['first', 1]);
    expect(rangeWithScores[1]).toEqual(['second', 2]);
    expect(rangeWithScores[2]).toEqual(['third', 3]);

    // Get score of member
    const score = await adapter.zscore('test:zset', 'second');
    expect(score).toBe(2);

    // Remove member
    const removed = await adapter.zrem('test:zset', 'second');
    expect(removed).toBe(1);

    const finalCount = await adapter.zcard('test:zset');
    expect(finalCount).toBe(2);
  });

  it('should handle bulk operations', async () => {
    if (!adapter) return;

    // Multi-set
    const items = [
      { key: 'bulk:1', value: 'value1' },
      { key: 'bulk:2', value: 'value2' },
      { key: 'bulk:3', value: 'value3' }
    ];

    await adapter.mset(items);

    // Multi-get
    const values = await adapter.mget(['bulk:1', 'bulk:2', 'bulk:3']);
    expect(values).toEqual(['value1', 'value2', 'value3']);

    // Pattern-based keys
    const keys = await adapter.keys('bulk:*');
    expect(keys).toHaveLength(3);
    expect(keys).toContain('bulk:1');
    expect(keys).toContain('bulk:2');
    expect(keys).toContain('bulk:3');

    // Multi-delete
    const deletedCount = await adapter.mdel(['bulk:1', 'bulk:2', 'bulk:3']);
    expect(deletedCount).toBe(3);
  });

  it('should handle counter operations', async () => {
    if (!adapter) return;

    // Increment
    const incr1 = await adapter.increment('test:counter');
    expect(incr1).toBe(1);

    const incr2 = await adapter.increment('test:counter', 5);
    expect(incr2).toBe(6);

    // Decrement
    const decr1 = await adapter.decrement('test:counter');
    expect(decr1).toBe(5);

    const decr2 = await adapter.decrement('test:counter', 2);
    expect(decr2).toBe(3);
  });

  it('should handle expiration and TTL', async () => {
    if (!adapter) return;

    await adapter.set('test:expire', 'will expire');
    
    // Set expiration
    const expireSet = await adapter.expire('test:expire', 10);
    expect(expireSet).toBe(true);

    // Check TTL
    const ttl = await adapter.ttl('test:expire');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10);

    // Remove expiration
    const persist = await adapter.persist('test:expire');
    expect(persist).toBe(true);

    const noTtl = await adapter.ttl('test:expire');
    expect(noTtl).toBe(-1); // -1 means no expiration
  });

  it('should handle scanning operations', async () => {
    if (!adapter) return;

    // Set up test data
    await adapter.set('scan:test1', 'value1');
    await adapter.set('scan:test2', 'value2');
    await adapter.set('scan:test3', 'value3');
    await adapter.set('other:key', 'other');

    const scanResults: string[] = [];
    for await (const key of adapter.scan('scan:*')) {
      scanResults.push(key);
    }

    expect(scanResults).toHaveLength(3);
    expect(scanResults).toContain('scan:test1');
    expect(scanResults).toContain('scan:test2');
    expect(scanResults).toContain('scan:test3');
    expect(scanResults).not.toContain('other:key');
  });
});