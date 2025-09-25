/**
 * High Traffic Design Patterns
 * 
 * This example demonstrates patterns for handling
 * thousands of concurrent users.
 */

import { DBBridge } from '@db-bridge/core';

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures
 */
class CircuitBreaker {
  private failures = 0;
  private successCount = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold = 5,
    private timeout = 60000,
    private successThreshold = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should be opened
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailTime > this.timeout) {
        console.log('Circuit breaker: HALF_OPEN (testing)');
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= this.successThreshold) {
          console.log('Circuit breaker: CLOSED (recovered)');
          this.state = 'CLOSED';
          this.failures = 0;
        }
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailTime = Date.now();
      
      if (this.failures >= this.threshold) {
        console.log('Circuit breaker: OPEN (too many failures)');
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successCount: this.successCount
    };
  }
}

/**
 * Request Batching
 * Combines multiple requests into one
 */
class BatchProcessor<T, R> {
  private queue: Array<{
    key: T;
    resolve: (value: R) => void;
    reject: (error: any) => void;
  }> = [];
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private batchSize = 100,
    private batchDelay = 10,
    private processFn: (keys: T[]) => Promise<Map<T, R>>
  ) {}

  async get(key: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject });

      if (this.queue.length >= this.batchSize) {
        this.processBatch();
      } else if (!this.timer && !this.processing) {
        this.timer = setTimeout(() => this.processBatch(), this.batchDelay);
      }
    });
  }

  private async processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const batch = this.queue.splice(0, this.batchSize);
    const keys = batch.map(item => item.key);

    try {
      const results = await this.processFn(keys);
      
      batch.forEach(({ key, resolve, reject }) => {
        const result = results.get(key);
        if (result !== undefined) {
          resolve(result);
        } else {
          reject(new Error(`No result for key: ${key}`));
        }
      });
    } catch (error) {
      batch.forEach(({ reject }) => reject(error));
    } finally {
      this.processing = false;
      
      // Process next batch if queue has items
      if (this.queue.length > 0) {
        setImmediate(() => this.processBatch());
      }
    }
  }
}

/**
 * Rate Limiter
 * Prevents API abuse
 */
class RateLimiter {
  private requests = new Map<string, number[]>();

  constructor(
    private maxRequests = 100,
    private windowMs = 60000
  ) {}

  async checkLimit(clientId: string): Promise<boolean> {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(
      timestamp => now - timestamp < this.windowMs
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    
    // Cleanup old entries periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }

    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [clientId, timestamps] of this.requests.entries()) {
      const valid = timestamps.filter(t => now - t < this.windowMs);
      if (valid.length === 0) {
        this.requests.delete(clientId);
      } else {
        this.requests.set(clientId, valid);
      }
    }
  }

  getStats() {
    return {
      clients: this.requests.size,
      totalRequests: Array.from(this.requests.values())
        .reduce((sum, arr) => sum + arr.length, 0)
    };
  }
}

/**
 * Connection Pool Manager
 * Manages multiple database connections
 */
class ConnectionPoolManager {
  private pools: Map<string, DBBridge> = new Map();
  
  constructor(private baseConfig: any) {}

  async getConnection(poolName: string, config?: any): Promise<DBBridge> {
    if (!this.pools.has(poolName)) {
      const db = DBBridge.mysql({
        ...this.baseConfig,
        ...config
      });
      await db.connect();
      this.pools.set(poolName, db);
    }
    
    return this.pools.get(poolName)!;
  }

  async closeAll() {
    for (const [name, db] of this.pools.entries()) {
      await db.disconnect();
      console.log(`Closed pool: ${name}`);
    }
    this.pools.clear();
  }

  getStats() {
    const stats: any = {};
    for (const [name, db] of this.pools.entries()) {
      stats[name] = db.getAdapter()?.getPoolStats();
    }
    return stats;
  }
}

// Example implementations
async function circuitBreakerExample() {
  console.log('\n=== Circuit Breaker Example ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const breaker = new CircuitBreaker(3, 5000, 2);

  try {
    await db.connect();

    // Simulate requests with potential failures
    for (let i = 1; i <= 10; i++) {
      try {
        const result = await breaker.execute(async () => {
          // Simulate failures on requests 3, 4, 5
          if (i >= 3 && i <= 5) {
            throw new Error('Database error');
          }
          return await db.query('SELECT 1 as result');
        });
        console.log(`Request ${i}: Success`, result.rows[0]);
      } catch (error) {
        console.log(`Request ${i}: Failed -`, error.message);
      }

      // Show breaker state
      const state = breaker.getState();
      console.log(`Breaker state: ${state.state}, failures: ${state.failures}`);

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } finally {
    await db.disconnect();
  }
}

async function batchingExample() {
  console.log('\n=== Request Batching Example ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    await db.connect();

    // Create batch processor for user lookups
    const userBatcher = new BatchProcessor<number, any>(
      50, // batch size
      5,  // delay ms
      async (userIds) => {
        console.log(`Fetching ${userIds.length} users in one query`);
        
        const users = await db.table('users')
          .whereIn('id', userIds)
          .get();
        
        return new Map(users.map(u => [u.id, u]));
      }
    );

    // Simulate many concurrent requests
    console.log('Simulating 200 concurrent user lookups...');
    const requests = [];
    
    for (let i = 1; i <= 200; i++) {
      const userId = Math.floor(Math.random() * 100) + 1;
      requests.push(
        userBatcher.get(userId)
          .then(user => console.log(`Got user ${userId}: ${user.name}`))
          .catch(err => console.error(`Failed to get user ${userId}:`, err))
      );
    }

    await Promise.all(requests);
    console.log('All requests completed');

  } finally {
    await db.disconnect();
  }
}

async function rateLimitingExample() {
  console.log('\n=== Rate Limiting Example ===');
  
  const limiter = new RateLimiter(10, 5000); // 10 requests per 5 seconds

  // Simulate requests from different clients
  const clients = ['client1', 'client2', 'client3'];
  
  for (let i = 1; i <= 40; i++) {
    const clientId = clients[Math.floor(Math.random() * clients.length)];
    
    const allowed = await limiter.checkLimit(clientId);
    console.log(`Request ${i} from ${clientId}: ${allowed ? 'ALLOWED' : 'RATE LIMITED'}`);
    
    // Show stats every 10 requests
    if (i % 10 === 0) {
      console.log('Rate limiter stats:', limiter.getStats());
    }

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

async function loadBalancingExample() {
  console.log('\n=== Load Balancing Example ===');
  
  class LoadBalancer {
    private servers: DBBridge[] = [];
    private currentIndex = 0;

    async addServer(config: any) {
      const db = DBBridge.mysql(config);
      await db.connect();
      this.servers.push(db);
      console.log(`Added server: ${config.host}`);
    }

    // Round-robin load balancing
    getNextServer(): DBBridge {
      const server = this.servers[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.servers.length;
      return server;
    }

    // Least connections load balancing
    getLeastBusyServer(): DBBridge {
      let leastBusy = this.servers[0];
      let minActive = Infinity;

      for (const server of this.servers) {
        const stats = server.getAdapter()?.getPoolStats();
        if (stats && stats.active < minActive) {
          minActive = stats.active;
          leastBusy = server;
        }
      }

      return leastBusy;
    }

    async closeAll() {
      for (const server of this.servers) {
        await server.disconnect();
      }
    }
  }

  const balancer = new LoadBalancer();

  try {
    // Add read replicas
    await balancer.addServer({ host: 'localhost', database: 'test_db', user: 'root', password: '' });
    // In production, these would be different servers
    // await balancer.addServer({ host: 'replica1.db.com', ... });
    // await balancer.addServer({ host: 'replica2.db.com', ... });

    // Simulate load balanced queries
    console.log('\nRound-robin queries:');
    for (let i = 1; i <= 6; i++) {
      const db = balancer.getNextServer();
      const result = await db.query('SELECT CONNECTION_ID() as conn_id');
      console.log(`Query ${i} - Connection ID: ${result.rows[0].conn_id}`);
    }

  } finally {
    await balancer.closeAll();
  }
}

async function connectionPoolingStrategies() {
  console.log('\n=== Connection Pooling Strategies ===');

  const poolManager = new ConnectionPoolManager({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    // Different pools for different workloads
    const readPool = await poolManager.getConnection('read', {
      pool: { min: 5, max: 50 }
    });

    const writePool = await poolManager.getConnection('write', {
      pool: { min: 2, max: 20 }
    });

    const analyticsPool = await poolManager.getConnection('analytics', {
      pool: { min: 1, max: 10 }
    });

    console.log('Created specialized connection pools');

    // Use appropriate pool for each operation
    const users = await readPool.table('users').limit(10).get();
    console.log(`Read pool: fetched ${users.length} users`);

    await writePool.table('logs').insert({
      action: 'user_login',
      timestamp: new Date()
    });
    console.log('Write pool: inserted log');

    const stats = await analyticsPool.query(
      'SELECT COUNT(*) as total FROM users'
    );
    console.log('Analytics pool:', stats.rows[0]);

    // Show pool statistics
    console.log('\nPool statistics:', poolManager.getStats());

  } finally {
    await poolManager.closeAll();
  }
}

// Main function
async function main() {
  console.log('=== High Traffic Design Patterns ===');
  console.log('\nPatterns for handling thousands of users:');
  console.log('1. Circuit Breaker - Prevent cascading failures');
  console.log('2. Request Batching - Reduce database load');
  console.log('3. Rate Limiting - Prevent abuse');
  console.log('4. Load Balancing - Distribute load');
  console.log('5. Connection Pooling - Optimize resources');

  // Run examples
  // await circuitBreakerExample();
  // await batchingExample();
  // await rateLimitingExample();
  // await loadBalancingExample();
  // await connectionPoolingStrategies();

  console.log('\nUncomment examples in main() to run them.');
}

main().catch(console.error);