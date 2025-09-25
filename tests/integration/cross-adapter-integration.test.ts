import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySQLAdapter } from '@db-bridge/mysql';
import { PostgreSQLAdapter } from '@db-bridge/postgresql';
import { RedisAdapter } from '@db-bridge/redis';
import { ConnectionConfig } from '@db-bridge/core';

describe('Cross-Adapter Integration Tests', () => {
  let mysqlAdapter: MySQLAdapter;
  let postgresAdapter: PostgreSQLAdapter;
  let redisAdapter: RedisAdapter;

  const mysqlConfig: ConnectionConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'test',
    database: process.env.MYSQL_DATABASE || 'test_db'
  };

  const postgresConfig: ConnectionConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'test',
    database: process.env.POSTGRES_DATABASE || 'test_db'
  };

  const redisConfig: ConnectionConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined
  };

  beforeAll(async () => {
    // Initialize adapters
    mysqlAdapter = new MySQLAdapter();
    postgresAdapter = new PostgreSQLAdapter();
    redisAdapter = new RedisAdapter();

    try {
      // Connect to databases
      await Promise.allSettled([
        mysqlAdapter.connect(mysqlConfig),
        postgresAdapter.connect(postgresConfig),
        redisAdapter.connect(redisConfig)
      ]);

      // Set up test tables
      try {
        await mysqlAdapter.execute(`
          CREATE TABLE IF NOT EXISTS cross_test_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(255),
            data JSON
          )
        `);
      } catch (e) {
        console.warn('MySQL setup failed:', e);
      }

      try {
        await postgresAdapter.execute(`
          CREATE TABLE IF NOT EXISTS cross_test_users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(255),
            data JSONB
          )
        `);
      } catch (e) {
        console.warn('PostgreSQL setup failed:', e);
      }

      try {
        await redisAdapter.flushdb();
      } catch (e) {
        console.warn('Redis setup failed:', e);
      }
    } catch (error) {
      console.warn('Cross-adapter setup failed:', error);
    }
  });

  afterAll(async () => {
    try {
      // Clean up
      await Promise.allSettled([
        mysqlAdapter?.execute('DROP TABLE IF EXISTS cross_test_users'),
        postgresAdapter?.execute('DROP TABLE IF EXISTS cross_test_users'),
        redisAdapter?.flushdb()
      ]);

      // Disconnect
      await Promise.allSettled([
        mysqlAdapter?.disconnect(),
        postgresAdapter?.disconnect(),
        redisAdapter?.disconnect()
      ]);
    } catch (error) {
      console.warn('Cross-adapter cleanup failed:', error);
    }
  });

  it('should demonstrate caching pattern with SQL databases', async () => {
    if (!mysqlAdapter || !redisAdapter) {
      console.warn('Skipping test: MySQL or Redis not available');
      return;
    }

    const userId = 12345;
    const userData = {
      id: userId,
      name: 'Cache Test User',
      email: 'cache@test.com'
    };

    // 1. Insert data into MySQL
    await mysqlAdapter.execute(
      'INSERT INTO cross_test_users (id, name, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)',
      [userData.id, userData.name, userData.email]
    );

    // 2. Cache the data in Redis
    const cacheKey = `user:${userId}`;
    await redisAdapter.set(cacheKey, userData, 300); // 5 min TTL

    // 3. Retrieve from cache first
    const cachedUser = await redisAdapter.get(cacheKey);
    expect(cachedUser).toEqual(userData);

    // 4. Verify cache miss scenario
    await redisAdapter.delete(cacheKey);
    const missedCache = await redisAdapter.get(cacheKey);
    expect(missedCache).toBeNull();

    // 5. Retrieve from database on cache miss
    const dbResult = await mysqlAdapter.query(
      'SELECT id, name, email FROM cross_test_users WHERE id = ?',
      [userId]
    );
    expect(dbResult.rows).toHaveLength(1);
    expect(dbResult.rows[0]).toMatchObject({
      id: userId,
      name: userData.name,
      email: userData.email
    });

    // 6. Repopulate cache
    await redisAdapter.set(cacheKey, dbResult.rows[0]);
    const repopulatedCache = await redisAdapter.get(cacheKey);
    expect(repopulatedCache).toMatchObject(userData);
  });

  it('should demonstrate data synchronization between SQL databases', async () => {
    if (!mysqlAdapter || !postgresAdapter) {
      console.warn('Skipping test: MySQL or PostgreSQL not available');
      return;
    }

    const userData = {
      name: 'Sync Test User',
      email: 'sync@test.com',
      data: { role: 'admin', preferences: { theme: 'dark' } }
    };

    // 1. Insert into MySQL
    const mysqlResult = await mysqlAdapter.execute(
      'INSERT INTO cross_test_users (name, email, data) VALUES (?, ?, ?)',
      [userData.name, userData.email, JSON.stringify(userData.data)]
    );
    const mysqlUserId = mysqlResult.insertId;

    // 2. Sync to PostgreSQL
    await postgresAdapter.execute(
      'INSERT INTO cross_test_users (id, name, email, data) VALUES ($1, $2, $3, $4)',
      [mysqlUserId, userData.name, userData.email, userData.data]
    );

    // 3. Verify data in both databases
    const mysqlData = await mysqlAdapter.query(
      'SELECT * FROM cross_test_users WHERE id = ?',
      [mysqlUserId]
    );

    const postgresData = await postgresAdapter.query(
      'SELECT * FROM cross_test_users WHERE id = $1',
      [mysqlUserId]
    );

    expect(mysqlData.rows).toHaveLength(1);
    expect(postgresData.rows).toHaveLength(1);

    expect(mysqlData.rows[0].name).toBe(userData.name);
    expect(postgresData.rows[0].name).toBe(userData.name);
    expect(mysqlData.rows[0].email).toBe(userData.email);
    expect(postgresData.rows[0].email).toBe(userData.email);
  });

  it('should demonstrate session management across adapters', async () => {
    if (!redisAdapter || !postgresAdapter) {
      console.warn('Skipping test: Redis or PostgreSQL not available');
      return;
    }

    const sessionId = 'session_123456';
    const userId = 789;
    
    // 1. Create user in PostgreSQL
    const userResult = await postgresAdapter.execute(
      'INSERT INTO cross_test_users (id, name, email) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET name = $2, email = $3',
      [userId, 'Session User', 'session@test.com']
    );

    // 2. Store session in Redis
    const sessionData = {
      userId: userId,
      loginTime: new Date().toISOString(),
      permissions: ['read', 'write'],
      lastActivity: new Date().toISOString()
    };

    await redisAdapter.set(`session:${sessionId}`, sessionData, 3600); // 1 hour

    // 3. Validate session and get user data
    const session = await redisAdapter.get(`session:${sessionId}`);
    expect(session).toEqual(sessionData);

    if (session) {
      const user = await postgresAdapter.query(
        'SELECT * FROM cross_test_users WHERE id = $1',
        [session.userId]
      );
      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].id).toBe(userId);
    }

    // 4. Update session activity
    sessionData.lastActivity = new Date().toISOString();
    await redisAdapter.set(`session:${sessionId}`, sessionData, 3600);

    // 5. Session cleanup
    const deleted = await redisAdapter.delete(`session:${sessionId}`);
    expect(deleted).toBe(true);

    const expiredSession = await redisAdapter.get(`session:${sessionId}`);
    expect(expiredSession).toBeNull();
  });

  it('should demonstrate event-driven data flow', async () => {
    if (!mysqlAdapter || !redisAdapter) {
      console.warn('Skipping test: MySQL or Redis not available');
      return;
    }

    const eventData = {
      eventId: 'event_001',
      userId: 456,
      eventType: 'user_created',
      payload: { name: 'Event User', email: 'event@test.com' },
      timestamp: new Date().toISOString()
    };

    // 1. Publish event to Redis (as message queue)
    await redisAdapter.lpush('events:user', JSON.stringify(eventData));

    // 2. Process event - insert user data
    const eventStr = await redisAdapter.rpop('events:user');
    expect(eventStr).toBeDefined();

    if (eventStr) {
      const event = JSON.parse(eventStr);
      
      // 3. Process the event - insert user
      await mysqlAdapter.execute(
        'INSERT INTO cross_test_users (id, name, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email)',
        [event.userId, event.payload.name, event.payload.email]
      );

      // 4. Store event log in Redis
      await redisAdapter.zadd(
        'processed_events',
        Date.now(),
        JSON.stringify({
          eventId: event.eventId,
          processedAt: new Date().toISOString(),
          status: 'success'
        })
      );

      // 5. Verify user was created
      const user = await mysqlAdapter.query(
        'SELECT * FROM cross_test_users WHERE id = ?',
        [event.userId]
      );
      expect(user.rows).toHaveLength(1);
      expect(user.rows[0].name).toBe(event.payload.name);

      // 6. Check event log
      const eventLogs = await redisAdapter.zrange('processed_events', 0, -1);
      expect(eventLogs.length).toBeGreaterThan(0);
      
      const latestLog = JSON.parse(eventLogs[eventLogs.length - 1]);
      expect(latestLog.eventId).toBe(event.eventId);
      expect(latestLog.status).toBe('success');
    }
  });

  it('should demonstrate distributed locking', async () => {
    if (!redisAdapter || !mysqlAdapter) {
      console.warn('Skipping test: Redis or MySQL not available');
      return;
    }

    const lockKey = 'lock:user_update:999';
    const lockValue = `lock_${Date.now()}`;
    const lockTTL = 10; // 10 seconds

    // 1. Acquire lock
    const lockAcquired = await redisAdapter.set(lockKey, lockValue, lockTTL, 'NX');
    expect(lockAcquired).toBe('OK');

    // 2. Try to acquire same lock (should fail)
    const secondLock = await redisAdapter.set(lockKey, 'different_value', lockTTL, 'NX');
    expect(secondLock).toBeNull();

    // 3. Perform critical operation under lock
    await mysqlAdapter.execute(
      'INSERT INTO cross_test_users (id, name, email) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = CONCAT(name, " - updated")',
      [999, 'Locked User', 'locked@test.com']
    );

    // 4. Verify lock is still held by us
    const currentLockValue = await redisAdapter.get(lockKey);
    expect(currentLockValue).toBe(lockValue);

    // 5. Release lock
    const lockReleased = await redisAdapter.delete(lockKey);
    expect(lockReleased).toBe(true);

    // 6. Verify lock is released
    const releasedLock = await redisAdapter.get(lockKey);
    expect(releasedLock).toBeNull();
  });
});