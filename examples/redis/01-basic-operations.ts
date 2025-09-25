/**
 * Redis Basic Operations
 * 
 * This example demonstrates all Redis data structures
 * and common operations.
 */

import { DBBridge } from '@db-bridge/core';

async function main() {
  const redis = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await redis.connect();
    console.log('✅ Connected to Redis\n');

    const client = redis.getAdapter() as any;

    // Key-Value operations
    await keyValueOperations(client);

    // String operations
    await stringOperations(client);

    // List operations
    await listOperations(client);

    // Set operations
    await setOperations(client);

    // Sorted Set operations
    await sortedSetOperations(client);

    // Hash operations
    await hashOperations(client);

    // Pub/Sub operations
    await pubSubOperations(client);

    // Transactions
    await transactionOperations(client);

    // Advanced operations
    await advancedOperations(client);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redis.disconnect();
    console.log('\n✅ Disconnected from Redis');
  }
}

async function keyValueOperations(client: any) {
  console.log('=== Key-Value Operations ===');

  // Basic set/get
  await client.set('user:1:name', 'John Doe');
  const name = await client.get('user:1:name');
  console.log('User name:', name);

  // Set with expiration (TTL)
  await client.set('session:abc123', JSON.stringify({
    userId: 1,
    loginTime: new Date()
  }), 3600); // 1 hour TTL

  // Check TTL
  const ttl = await client.ttl('session:abc123');
  console.log('Session TTL:', ttl, 'seconds');

  // Set if not exists
  const wasSet = await client.setnx('user:1:email', 'john@example.com');
  console.log('Email set:', wasSet);

  // Multiple operations
  await client.mset({
    'config:app:name': 'My App',
    'config:app:version': '1.0.0',
    'config:app:env': 'production'
  });

  const configs = await client.mget([
    'config:app:name',
    'config:app:version',
    'config:app:env'
  ]);
  console.log('App config:', configs);

  // Check existence
  const exists = await client.exists('user:1:name');
  console.log('Key exists:', exists);

  // Delete keys
  await client.del('temp:key1', 'temp:key2');

  // Key patterns
  const keys = await client.keys('config:*');
  console.log('Config keys:', keys);
}

async function stringOperations(client: any) {
  console.log('\n=== String Operations ===');

  // Increment/Decrement
  await client.set('counter:page:views', '0');
  await client.incr('counter:page:views');
  await client.incrby('counter:page:views', 5);
  const views = await client.get('counter:page:views');
  console.log('Page views:', views);

  // Float operations
  await client.set('stats:temperature', '20.5');
  await client.incrbyfloat('stats:temperature', 1.5);
  const temp = await client.get('stats:temperature');
  console.log('Temperature:', temp);

  // String manipulation
  await client.set('message', 'Hello');
  await client.append('message', ' World');
  const message = await client.get('message');
  console.log('Message:', message);

  // Get string length
  const length = await client.strlen('message');
  console.log('Message length:', length);

  // Bit operations
  await client.setbit('user:1:features', 0, 1); // Feature 0 enabled
  await client.setbit('user:1:features', 2, 1); // Feature 2 enabled
  const hasFeature = await client.getbit('user:1:features', 0);
  console.log('Has feature 0:', hasFeature);
}

async function listOperations(client: any) {
  console.log('\n=== List Operations ===');

  // Push elements
  await client.lpush('queue:tasks', 'task3', 'task2', 'task1');
  await client.rpush('queue:tasks', 'task4', 'task5');

  // Get list length
  const length = await client.llen('queue:tasks');
  console.log('Queue length:', length);

  // Get range
  const tasks = await client.lrange('queue:tasks', 0, -1);
  console.log('All tasks:', tasks);

  // Pop elements
  const firstTask = await client.lpop('queue:tasks');
  const lastTask = await client.rpop('queue:tasks');
  console.log('Processing:', firstTask, 'and', lastTask);

  // Blocking operations (with timeout)
  const blockedTask = await client.blpop('queue:urgent', 1);
  console.log('Blocked pop result:', blockedTask);

  // Trim list
  await client.ltrim('queue:tasks', 0, 9); // Keep only first 10

  // Insert elements
  await client.linsert('queue:tasks', 'BEFORE', 'task3', 'task2.5');
}

async function setOperations(client: any) {
  console.log('\n=== Set Operations ===');

  // Add members
  await client.sadd('tags:post:1', 'javascript', 'nodejs', 'redis');
  await client.sadd('tags:post:2', 'python', 'redis', 'database');

  // Get all members
  const post1Tags = await client.smembers('tags:post:1');
  console.log('Post 1 tags:', post1Tags);

  // Check membership
  const hasTag = await client.sismember('tags:post:1', 'nodejs');
  console.log('Post 1 has nodejs tag:', hasTag);

  // Set operations
  const commonTags = await client.sinter('tags:post:1', 'tags:post:2');
  console.log('Common tags:', commonTags);

  const allTags = await client.sunion('tags:post:1', 'tags:post:2');
  console.log('All unique tags:', allTags);

  const uniqueToPost1 = await client.sdiff('tags:post:1', 'tags:post:2');
  console.log('Tags unique to post 1:', uniqueToPost1);

  // Store result of operation
  await client.sinterstore('tags:common', 'tags:post:1', 'tags:post:2');

  // Random member
  const randomTag = await client.srandmember('tags:post:1');
  console.log('Random tag:', randomTag);

  // Remove members
  await client.srem('tags:post:1', 'temp-tag');
}

async function sortedSetOperations(client: any) {
  console.log('\n=== Sorted Set Operations ===');

  // Add members with scores
  await client.zadd('leaderboard:game1', [
    { score: 100, member: 'player1' },
    { score: 250, member: 'player2' },
    { score: 150, member: 'player3' },
    { score: 300, member: 'player4' }
  ]);

  // Get rank (0-based)
  const rank = await client.zrank('leaderboard:game1', 'player2');
  console.log('Player2 rank:', rank);

  // Get reverse rank
  const reverseRank = await client.zrevrank('leaderboard:game1', 'player2');
  console.log('Player2 rank from top:', reverseRank);

  // Get score
  const score = await client.zscore('leaderboard:game1', 'player2');
  console.log('Player2 score:', score);

  // Get range by rank
  const top3 = await client.zrevrange('leaderboard:game1', 0, 2, 'WITHSCORES');
  console.log('Top 3 players:', top3);

  // Get range by score
  const midRange = await client.zrangebyscore('leaderboard:game1', 100, 200);
  console.log('Players with score 100-200:', midRange);

  // Increment score
  await client.zincrby('leaderboard:game1', 50, 'player1');

  // Count members in score range
  const count = await client.zcount('leaderboard:game1', 150, 300);
  console.log('Players with score 150-300:', count);

  // Remove by score range
  await client.zremrangebyscore('leaderboard:game1', '-inf', 50);
}

async function hashOperations(client: any) {
  console.log('\n=== Hash Operations ===');

  // Set hash fields
  await client.hset('user:1', {
    name: 'John Doe',
    email: 'john@example.com',
    age: '30',
    city: 'New York'
  });

  // Get single field
  const email = await client.hget('user:1', 'email');
  console.log('User email:', email);

  // Get all fields
  const user = await client.hgetall('user:1');
  console.log('User data:', user);

  // Get multiple fields
  const fields = await client.hmget('user:1', ['name', 'age']);
  console.log('Name and age:', fields);

  // Check field existence
  const hasPhone = await client.hexists('user:1', 'phone');
  console.log('Has phone:', hasPhone);

  // Get all keys or values
  const keys = await client.hkeys('user:1');
  const values = await client.hvals('user:1');
  console.log('Keys:', keys);
  console.log('Values:', values);

  // Increment numeric field
  await client.hincrby('user:1', 'login_count', 1);

  // Get hash size
  const size = await client.hlen('user:1');
  console.log('Hash size:', size);

  // Delete fields
  await client.hdel('user:1', 'temp_field');
}

async function pubSubOperations(client: any) {
  console.log('\n=== Pub/Sub Operations ===');

  // Note: In real applications, you'd have separate connections for pub/sub
  
  // Publish messages
  await client.publish('news:tech', JSON.stringify({
    title: 'New Redis Features',
    timestamp: new Date()
  }));

  await client.publish('news:sports', JSON.stringify({
    title: 'Game Results',
    timestamp: new Date()
  }));

  console.log('Messages published to channels');

  // Pattern-based channel info
  const channels = await client.pubsub('CHANNELS', 'news:*');
  console.log('Active news channels:', channels);
}

async function transactionOperations(client: any) {
  console.log('\n=== Transaction Operations ===');

  // Using pipeline for multiple commands
  const pipeline = client.pipeline();
  
  pipeline.set('transaction:1', 'start');
  pipeline.incr('transaction:counter');
  pipeline.hset('transaction:data', 'status', 'processing');
  pipeline.expire('transaction:1', 3600);

  const results = await pipeline.exec();
  console.log('Pipeline results:', results);

  // Multi/exec transaction
  const multi = client.multi();
  
  multi.set('account:1:balance', '1000');
  multi.set('account:2:balance', '500');
  multi.decrby('account:1:balance', 100);
  multi.incrby('account:2:balance', 100);

  const txResults = await multi.exec();
  console.log('Transaction results:', txResults);

  // Check balances
  const balance1 = await client.get('account:1:balance');
  const balance2 = await client.get('account:2:balance');
  console.log('Final balances:', { account1: balance1, account2: balance2 });
}

async function advancedOperations(client: any) {
  console.log('\n=== Advanced Operations ===');

  // Scan keys (cursor-based iteration)
  let cursor = '0';
  const allKeys: string[] = [];
  
  do {
    const result = await client.scan(cursor, 'MATCH', 'user:*', 'COUNT', 10);
    cursor = result[0];
    allKeys.push(...result[1]);
  } while (cursor !== '0');
  
  console.log('User keys found:', allKeys.length);

  // GeoSpatial operations
  await client.geoadd('stores:location', [
    { longitude: -73.935242, latitude: 40.730610, member: 'store:1' },
    { longitude: -73.990502, latitude: 40.757507, member: 'store:2' },
    { longitude: -73.978057, latitude: 40.763996, member: 'store:3' }
  ]);

  // Find nearby stores
  const nearby = await client.georadius(
    'stores:location',
    -73.970, 40.750,
    5, 'km',
    'WITHDIST', 'WITHCOORD', 'COUNT', 3, 'ASC'
  );
  console.log('Nearby stores:', nearby);

  // HyperLogLog for cardinality estimation
  await client.pfadd('unique:visitors:2024-01', 'user1', 'user2', 'user3');
  await client.pfadd('unique:visitors:2024-01', 'user2', 'user4', 'user5');
  
  const uniqueCount = await client.pfcount('unique:visitors:2024-01');
  console.log('Unique visitors (estimated):', uniqueCount);

  // Streams (Redis 5.0+)
  await client.xadd('events:stream', '*', {
    type: 'click',
    userId: '123',
    timestamp: new Date().toISOString()
  });

  const streamData = await client.xrange('events:stream', '-', '+', 'COUNT', 10);
  console.log('Stream events:', streamData);

  // Lua scripting
  const script = `
    local key = KEYS[1]
    local increment = tonumber(ARGV[1])
    local current = redis.call('get', key)
    if current then
      current = tonumber(current)
    else
      current = 0
    end
    local new_value = current + increment
    redis.call('set', key, new_value)
    return new_value
  `;

  const result = await client.eval(script, 1, 'lua:counter', '10');
  console.log('Lua script result:', result);
}

main().catch(console.error);