/**
 * Test Runner for DB Bridge Examples
 * 
 * This script tests database connectivity and runs basic operations
 * to verify everything is working correctly.
 */

import { DBBridge } from '@db-bridge/core';

interface TestResult {
  database: string;
  status: 'success' | 'failed';
  message: string;
  error?: any;
}

async function testMySQL(): Promise<TestResult> {
  const db = DBBridge.mysql({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    await db.connect();
    console.log('✅ MySQL connected');

    // Create test table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS test_table (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert test data
    await db.execute('INSERT INTO test_table (name) VALUES (?)', ['Test Entry']);

    // Query test data
    const result = await db.query('SELECT * FROM test_table ORDER BY id DESC LIMIT 1');
    console.log('MySQL test query result:', result.rows[0]);

    // Clean up
    await db.execute('DROP TABLE IF EXISTS test_table');

    await db.disconnect();
    
    return {
      database: 'MySQL',
      status: 'success',
      message: 'All tests passed'
    };
  } catch (error) {
    await db.disconnect().catch(() => {});
    return {
      database: 'MySQL',
      status: 'failed',
      message: error.message,
      error
    };
  }
}

async function testPostgreSQL(): Promise<TestResult> {
  const db = DBBridge.postgresql({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'test_db'
  });

  try {
    await db.connect();
    console.log('✅ PostgreSQL connected');

    // Create test table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        data JSONB,
        tags TEXT[],
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert test data with PostgreSQL features
    await db.execute(
      'INSERT INTO test_table (name, data, tags) VALUES ($1, $2, $3)',
      ['Test Entry', JSON.stringify({ key: 'value' }), ['test', 'example']]
    );

    // Query test data
    const result = await db.query(`
      SELECT 
        id, 
        name, 
        data->>'key' as data_key,
        array_length(tags, 1) as tag_count
      FROM test_table 
      ORDER BY id DESC 
      LIMIT 1
    `);
    console.log('PostgreSQL test query result:', result.rows[0]);

    // Clean up
    await db.execute('DROP TABLE IF EXISTS test_table');

    await db.disconnect();
    
    return {
      database: 'PostgreSQL',
      status: 'success',
      message: 'All tests passed'
    };
  } catch (error) {
    await db.disconnect().catch(() => {});
    return {
      database: 'PostgreSQL',
      status: 'failed',
      message: error.message,
      error
    };
  }
}

async function testRedis(): Promise<TestResult> {
  const db = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await db.connect();
    console.log('✅ Redis connected');

    const redis = db.getAdapter() as any;

    // Test basic operations
    await redis.set('test:key', 'test value');
    const value = await redis.get('test:key');
    console.log('Redis get result:', value);

    // Test data structures
    await redis.hset('test:hash', { field1: 'value1', field2: 'value2' });
    const hash = await redis.hgetall('test:hash');
    console.log('Redis hash result:', hash);

    await redis.lpush('test:list', 'item1', 'item2', 'item3');
    const list = await redis.lrange('test:list', 0, -1);
    console.log('Redis list result:', list);

    // Clean up
    await redis.del('test:key', 'test:hash', 'test:list');

    await db.disconnect();
    
    return {
      database: 'Redis',
      status: 'success',
      message: 'All tests passed'
    };
  } catch (error) {
    await db.disconnect().catch(() => {});
    return {
      database: 'Redis',
      status: 'failed',
      message: error.message,
      error
    };
  }
}

async function runAllTests() {
  console.log('=== DB Bridge Connection Tests ===\n');
  console.log('Testing all database connections...\n');

  const results: TestResult[] = [];

  // Test MySQL
  console.log('--- Testing MySQL ---');
  results.push(await testMySQL());
  console.log('');

  // Test PostgreSQL
  console.log('--- Testing PostgreSQL ---');
  results.push(await testPostgreSQL());
  console.log('');

  // Test Redis
  console.log('--- Testing Redis ---');
  results.push(await testRedis());
  console.log('');

  // Summary
  console.log('=== Test Summary ===\n');
  results.forEach(result => {
    const icon = result.status === 'success' ? '✅' : '❌';
    console.log(`${icon} ${result.database}: ${result.message}`);
    if (result.error && process.env.DEBUG) {
      console.error('   Error details:', result.error);
    }
  });

  const allPassed = results.every(r => r.status === 'success');
  
  if (allPassed) {
    console.log('\n🎉 All database connections are working!');
    console.log('\nYou can now run any example with:');
    console.log('  npx ts-node examples/basic/01-getting-started.ts');
    console.log('  npx ts-node examples/mysql/01-basic-crud.ts');
    console.log('  npx ts-node examples/postgresql/01-basic-crud.ts');
    console.log('  npx ts-node examples/redis/01-basic-operations.ts');
  } else {
    console.log('\n⚠️  Some databases are not available.');
    console.log('\nMake sure they are running:');
    
    if (results.find(r => r.database === 'MySQL' && r.status === 'failed')) {
      console.log('\nMySQL:');
      console.log('  docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD= -e MYSQL_ALLOW_EMPTY_PASSWORD=yes mysql:8');
    }
    
    if (results.find(r => r.database === 'PostgreSQL' && r.status === 'failed')) {
      console.log('\nPostgreSQL:');
      console.log('  docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:15');
    }
    
    if (results.find(r => r.database === 'Redis' && r.status === 'failed')) {
      console.log('\nRedis:');
      console.log('  docker run -d -p 6379:6379 redis:7');
    }
  }

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch(console.error);