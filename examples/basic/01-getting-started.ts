/**
 * Getting Started with DB Bridge
 * 
 * This example shows the basic usage of DB Bridge
 * with different databases.
 */

import { DBBridge } from '@db-bridge/core';

async function mysqlExample() {
  console.log('\n=== MySQL Basic Example ===');
  
  // Create MySQL connection
  const db = DBBridge.mysql({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    // Connect to database
    await db.connect();
    console.log('✅ Connected to MySQL');

    // Simple query
    const users = await db.table('users').get();
    console.log(`Found ${users.length} users`);

    // Query with conditions
    const activeUsers = await db.table('users')
      .where('active', true)
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    console.log(`Found ${activeUsers.length} active users`);

    // Insert data
    const newUserId = await db.table('users').insert({
      name: 'John Doe',
      email: 'john@example.com',
      active: true
    });
    console.log('New user ID:', newUserId);

    // Update data
    const updateCount = await db.table('users')
      .where('id', newUserId)
      .update({ name: 'Jane Doe' });
    console.log('Updated rows:', updateCount);

    // Delete data
    const deleteCount = await db.table('users')
      .where('id', newUserId)
      .delete();
    console.log('Deleted rows:', deleteCount);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('✅ Disconnected from MySQL');
  }
}

async function postgresqlExample() {
  console.log('\n=== PostgreSQL Basic Example ===');
  
  const db = DBBridge.postgresql({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'test_db'
  });

  try {
    await db.connect();
    console.log('✅ Connected to PostgreSQL');

    // PostgreSQL specific features
    const result = await db.query(
      'SELECT $1::text as message, NOW() as timestamp',
      ['Hello from PostgreSQL']
    );
    console.log('Query result:', result.rows[0]);

    // JSON operations
    const products = await db.table('products')
      .whereRaw("data->>'category' = ?", ['electronics'])
      .get();
    console.log(`Found ${products.length} electronics products`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('✅ Disconnected from PostgreSQL');
  }
}

async function redisExample() {
  console.log('\n=== Redis Basic Example ===');
  
  const redis = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await redis.connect();
    console.log('✅ Connected to Redis');

    const adapter = redis.getAdapter() as any;

    // Basic key-value operations
    await adapter.set('app:name', 'DB Bridge Example');
    const appName = await adapter.get('app:name');
    console.log('App name:', appName);

    // Set with TTL
    await adapter.set('session:123', JSON.stringify({
      userId: 1,
      username: 'john_doe'
    }), 3600); // 1 hour TTL
    console.log('Session stored with TTL');

    // Check if key exists
    const exists = await adapter.exists('session:123');
    console.log('Session exists:', exists);

    // Delete key
    await adapter.del('app:name');
    console.log('Key deleted');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redis.disconnect();
    console.log('✅ Disconnected from Redis');
  }
}

// Main function
async function main() {
  console.log('=== DB Bridge Getting Started ===');
  console.log('\nThis example demonstrates basic usage of DB Bridge.');
  console.log('Make sure your databases are running before executing.\n');

  // Uncomment the database you want to test
  // await mysqlExample();
  // await postgresqlExample();
  // await redisExample();

  console.log('\nTo run an example, uncomment the desired function in main()');
}

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

main().catch(console.error);