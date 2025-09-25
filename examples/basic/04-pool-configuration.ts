/**
 * Connection Pool Configuration Examples
 * 
 * This example shows how to configure connection pools
 * for different scenarios and workloads.
 */

import { DBBridge } from '@db-bridge/core';

async function developmentPool() {
  console.log('\n=== Development Pool Configuration ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dev_db',
    
    // Minimal pool for development
    pool: {
      min: 1,       // Keep 1 connection ready
      max: 5,       // Maximum 5 connections
      acquireTimeout: 10000,  // 10 second timeout
      idleTimeout: 60000,     // Close idle connections after 1 minute
      validateOnBorrow: false // Skip validation for faster development
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected with development pool');

    // Check pool stats
    const stats = db.getAdapter()?.getPoolStats();
    console.log('Pool stats:', stats);

    // Run some queries
    const users = await db.table('users').limit(5).get();
    console.log(`Found ${users.length} users`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
  }
}

async function productionPool() {
  console.log('\n=== Production Pool Configuration ===');
  
  const db = DBBridge.mysql({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'app_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'production_db',
    
    // Optimized for production workload
    pool: {
      min: 10,      // Keep 10 connections ready
      max: 100,     // Scale up to 100 connections
      acquireTimeout: 30000,    // 30 second timeout
      idleTimeout: 300000,      // 5 minutes idle timeout
      validateOnBorrow: true,   // Always validate connections
      maxLifetime: 1800000,     // 30 minutes max lifetime
      queueLimit: 0,            // Unlimited queue
      enableKeepAlive: true,    // Keep TCP connections alive
      keepAliveInitialDelay: 0  // Start immediately
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected with production pool');

    // Simulate concurrent requests
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        db.table('products')
          .where('category', 'electronics')
          .limit(10)
          .get()
      );
    }

    console.log('Executing 50 concurrent queries...');
    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;
    
    console.log(`Completed in ${duration}ms`);

    // Check pool stats after load
    const stats = db.getAdapter()?.getPoolStats();
    console.log('Pool stats after load:', stats);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
  }
}

async function highTrafficPool() {
  console.log('\n=== High Traffic Pool Configuration ===');
  
  // Configuration for very high traffic applications
  const db = DBBridge.mysql({
    host: 'primary.db.cluster',
    user: 'app',
    password: process.env.DB_PASSWORD!,
    database: 'main_db',
    
    // Maximum performance configuration
    pool: {
      min: 20,      // Higher minimum
      max: 200,     // Very high maximum
      acquireTimeout: 60000,    // 1 minute timeout
      idleTimeout: 120000,      // 2 minutes idle timeout
      validateOnBorrow: true,
      maxLifetime: 900000,      // 15 minutes max lifetime
      queueLimit: 1000,         // Limit queue to prevent memory issues
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    }
  });

  console.log('Configuration for handling thousands of concurrent users');
  console.log('- High min/max pool size');
  console.log('- Longer timeouts for busy periods');
  console.log('- Queue limit to prevent memory overflow');
  console.log('- Shorter connection lifetime for load balancing');
}

async function microservicePool() {
  console.log('\n=== Microservice Pool Configuration ===');
  
  // Lean configuration for microservices
  const db = DBBridge.postgresql({
    host: 'postgres.internal',
    port: 5432,
    user: 'service_user',
    password: process.env.DB_PASSWORD!,
    database: 'service_db',
    
    // Microservice optimized
    pool: {
      min: 2,       // Small minimum
      max: 20,      // Moderate maximum
      acquireTimeout: 15000,    // 15 seconds
      idleTimeout: 180000,      // 3 minutes
      validateOnBorrow: true,
      maxLifetime: 3600000      // 1 hour
    }
  });

  console.log('Configuration optimized for microservices:');
  console.log('- Small pool size (container resource limits)');
  console.log('- Moderate scaling capability');
  console.log('- Longer connection lifetime (stable environment)');
}

async function batchProcessingPool() {
  console.log('\n=== Batch Processing Pool Configuration ===');
  
  // Configuration for batch jobs and data processing
  const db = DBBridge.postgresql({
    host: 'analytics.db.server',
    database: 'analytics',
    user: 'batch_user',
    password: process.env.BATCH_DB_PASSWORD!,
    
    // Batch processing optimized
    pool: {
      min: 1,       // Low minimum (jobs run periodically)
      max: 10,      // Limited connections (long-running queries)
      acquireTimeout: 300000,   // 5 minutes (complex queries)
      idleTimeout: 600000,      // 10 minutes
      validateOnBorrow: true,
      maxLifetime: 7200000      // 2 hours
    }
  });

  console.log('Configuration for batch processing:');
  console.log('- Low pool size (few concurrent jobs)');
  console.log('- Very long timeouts (complex analytics queries)');
  console.log('- Long idle timeout (periodic jobs)');
}

async function poolMonitoring() {
  console.log('\n=== Pool Monitoring Example ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db',
    pool: {
      min: 5,
      max: 20
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected');

    // Monitor pool stats during operations
    const monitor = setInterval(() => {
      const stats = db.getAdapter()?.getPoolStats();
      if (stats) {
        console.log(`[Monitor] Total: ${stats.total}, Active: ${stats.active}, Idle: ${stats.idle}, Waiting: ${stats.waiting}`);
        
        // Warnings
        if (stats.waiting > 10) {
          console.warn('⚠️  High number of waiting connections!');
        }
        if (stats.idle === 0 && stats.active === stats.total) {
          console.warn('⚠️  Pool exhausted! Consider increasing max connections.');
        }
      }
    }, 1000);

    // Simulate load
    console.log('\nSimulating load...');
    const operations = [];
    for (let i = 0; i < 30; i++) {
      operations.push(
        db.query('SELECT SLEEP(0.5)').catch(err => console.error('Query failed:', err))
      );
    }

    await Promise.all(operations);
    clearInterval(monitor);

    // Final stats
    const finalStats = db.getAdapter()?.getPoolStats();
    console.log('\nFinal pool stats:', finalStats);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
  }
}

async function dynamicPoolAdjustment() {
  console.log('\n=== Dynamic Pool Adjustment ===');

  class AdaptivePool {
    private configs = {
      low: { min: 2, max: 10 },
      medium: { min: 5, max: 50 },
      high: { min: 10, max: 100 },
      peak: { min: 20, max: 200 }
    };

    async adjustPool(load: 'low' | 'medium' | 'high' | 'peak') {
      console.log(`\nAdjusting pool for ${load} load...`);
      
      const db = DBBridge.mysql({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'test_db',
        pool: this.configs[load]
      });

      await db.connect();
      console.log(`✅ Pool adjusted: min=${this.configs[load].min}, max=${this.configs[load].max}`);
      
      return db;
    }
  }

  const adaptive = new AdaptivePool();
  
  // Simulate different load scenarios
  const scenarios = ['low', 'medium', 'high', 'peak'] as const;
  
  for (const load of scenarios) {
    const db = await adaptive.adjustPool(load);
    
    // Simulate queries for this load level
    const queryCount = load === 'low' ? 5 : load === 'medium' ? 20 : load === 'high' ? 50 : 100;
    console.log(`Running ${queryCount} queries...`);
    
    const queries = Array(queryCount).fill(0).map(() => 
      db.query('SELECT 1').catch(() => null)
    );
    
    await Promise.all(queries);
    await db.disconnect();
  }
}

// Main function with sizing guide
async function main() {
  console.log('=== Connection Pool Configuration Guide ===');
  console.log('\nPool Sizing Recommendations:');
  console.log('┌─────────────────────┬────────┬────────┬─────────────────┐');
  console.log('│ Environment         │ Min    │ Max    │ Notes           │');
  console.log('├─────────────────────┼────────┼────────┼─────────────────┤');
  console.log('│ Development         │ 1-2    │ 5-10   │ Minimal         │');
  console.log('│ Testing             │ 2-5    │ 10-20  │ Moderate        │');
  console.log('│ Staging             │ 5-10   │ 20-50  │ Prod-like       │');
  console.log('│ Production (Small)  │ 5-10   │ 20-50  │ <100 users      │');
  console.log('│ Production (Medium) │ 10-20  │ 50-100 │ 100-1000 users  │');
  console.log('│ Production (Large)  │ 20-50  │ 100+   │ 1000+ users     │');
  console.log('│ Microservice        │ 2-5    │ 10-30  │ Container limit │');
  console.log('│ Batch Processing    │ 1-5    │ 5-20   │ Long queries    │');
  console.log('└─────────────────────┴────────┴────────┴─────────────────┘');

  console.log('\nFormula: max_pool = (max_db_connections * 0.8) / number_of_app_instances');
  console.log('\nExample: MySQL max_connections=200, 4 app servers');
  console.log('max_pool per server = (200 * 0.8) / 4 = 40 connections\n');

  // Run examples
  // await developmentPool();
  // await productionPool();
  // await poolMonitoring();
  // await dynamicPoolAdjustment();
  
  console.log('Uncomment examples in main() to run them.');
}

main().catch(console.error);