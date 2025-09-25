# Getting Started with DB Bridge

Welcome to DB Bridge! This guide will help you get up and running in minutes.

## Installation

First, install the core package:

```bash
npm install @db-bridge/core
```

Then install the adapter for your database:

```bash
# For MySQL or MariaDB
npm install @db-bridge/mysql mysql2

# For PostgreSQL
npm install @db-bridge/postgresql pg

# For Redis
npm install @db-bridge/redis ioredis
```

## Your First Connection

### Option 1: Using the Unified API (Recommended)

```typescript
import { DBBridge } from '@db-bridge/core';

// Create a database instance
const db = new DBBridge({
  type: 'mysql', // or 'postgresql', 'redis'
  connection: {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'my_app'
  }
});

// Connect
await db.connect();

// Start querying!
const users = await db.table('users').get();
console.log(users);

// Don't forget to disconnect
await db.disconnect();
```

### Option 2: Using Static Factories

```typescript
import { DBBridge } from '@db-bridge/core';

// MySQL
const mysql = DBBridge.mysql({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'my_app'
});

// PostgreSQL
const postgres = DBBridge.postgresql({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'my_app'
});

// Redis
const redis = DBBridge.redis({
  host: 'localhost',
  port: 6379
});
```

## Basic CRUD Operations

### Create (INSERT)

```typescript
// Single insert
const user = await db.table('users').insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});
console.log('New user ID:', user.id);

// Multiple inserts
const users = await db.table('users').insert([
  { name: 'Jane', email: 'jane@example.com' },
  { name: 'Bob', email: 'bob@example.com' }
]);
```

### Read (SELECT)

```typescript
// Get all records
const allUsers = await db.table('users').get();

// Get first record
const firstUser = await db.table('users').first();

// Get with conditions
const adults = await db.table('users')
  .where('age', '>=', 18)
  .get();

// Get specific columns
const names = await db.table('users')
  .select('id', 'name')
  .get();

// Get with ordering and limit
const recentUsers = await db.table('users')
  .orderBy('created_at', 'desc')
  .limit(10)
  .get();
```

### Update

```typescript
// Update by ID
await db.table('users')
  .where('id', 1)
  .update({ name: 'John Smith' });

// Update multiple records
await db.table('users')
  .where('status', 'pending')
  .update({ status: 'active' });

// Increment/Decrement
await db.table('products')
  .where('id', 1)
  .increment('views', 1);
```

### Delete

```typescript
// Delete by ID
await db.table('users')
  .where('id', 1)
  .delete();

// Delete multiple
await db.table('users')
  .where('last_login', '<', '2023-01-01')
  .delete();
```

## Working with Relationships

### Joins

```typescript
// Inner join
const ordersWithCustomers = await db.table('orders')
  .join('customers', 'orders.customer_id', '=', 'customers.id')
  .select('orders.*', 'customers.name as customer_name')
  .get();

// Left join
const productsWithReviews = await db.table('products')
  .leftJoin('reviews', 'products.id', '=', 'reviews.product_id')
  .select('products.*', 'AVG(reviews.rating) as avg_rating')
  .groupBy('products.id')
  .get();

// Multiple joins
const orderDetails = await db.table('orders')
  .join('customers', 'orders.customer_id', '=', 'customers.id')
  .join('order_items', 'orders.id', '=', 'order_items.order_id')
  .join('products', 'order_items.product_id', '=', 'products.id')
  .select(
    'orders.id',
    'customers.name',
    'products.title',
    'order_items.quantity'
  )
  .get();
```

## Transactions

Ensure data consistency with transactions:

```typescript
try {
  await db.transaction(async (trx) => {
    // Create order
    const order = await trx.table('orders').insert({
      customer_id: 1,
      total: 150.00,
      status: 'pending'
    });

    // Add order items
    await trx.table('order_items').insert([
      { order_id: order.id, product_id: 1, quantity: 2, price: 50.00 },
      { order_id: order.id, product_id: 2, quantity: 1, price: 50.00 }
    ]);

    // Update inventory
    await trx.table('products')
      .where('id', 1)
      .decrement('stock', 2);
    
    await trx.table('products')
      .where('id', 2)
      .decrement('stock', 1);

    // All queries succeed or all fail
  });
} catch (error) {
  console.error('Transaction failed:', error);
  // Automatic rollback
}
```

## Using Cache

Enable caching for better performance:

```typescript
// Create database with cache enabled
const db = DBBridge.withCache('mysql', {
  host: 'localhost',
  database: 'my_app'
});

// Cache query results
const popularProducts = await db.cached('popular-products', async () => {
  return db.table('products')
    .where('featured', true)
    .orderBy('sales', 'desc')
    .limit(10)
    .get();
}, 3600); // Cache for 1 hour

// Clear cache when data changes
await db.table('products').insert({ ... });
await db.clearCache('popular-products');
```

## Working with Redis

When using Redis as your primary database:

```typescript
const redis = DBBridge.redis();
await redis.connect();

// String operations
await redis.redis.set('key', 'value');
const value = await redis.redis.get('key');

// Object storage (auto JSON)
await redis.redis.set('user:1', { name: 'John', age: 30 });
const user = await redis.redis.get('user:1');

// Hash operations
await redis.redis.hset('user:2', 'name', 'Jane');
await redis.redis.hset('user:2', 'email', 'jane@example.com');

// Or set entire object as hash
await redis.redis.hsetObject('user:3', {
  name: 'Bob',
  email: 'bob@example.com',
  role: 'admin'
});

// Lists (queues)
await redis.redis.lpush('tasks', 'send-email');
const task = await redis.redis.rpop('tasks');

// Sets (unique values)
await redis.redis.sadd('tags', 'javascript', 'nodejs');
const tags = await redis.redis.smembers('tags');

// Sorted sets (leaderboards)
await redis.redis.zadd('scores', 100, 'player1');
await redis.redis.zadd('scores', 150, 'player2');
const topPlayers = await redis.redis.zrevrange('scores', 0, 9);
```

## Error Handling

```typescript
import { ConnectionError, QueryError, ValidationError } from '@db-bridge/core';

try {
  await db.connect();
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Failed to connect:', error.message);
  }
}

try {
  await db.table('users').insert({ email: 'invalid-email' });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Validation failed:', error.message);
  }
}
```

## Environment Configuration

Use environment variables for configuration:

```typescript
const db = new DBBridge({
  type: process.env.DB_TYPE as 'mysql' | 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'my_app'
  },
  options: {
    logging: process.env.NODE_ENV === 'development'
  }
});
```

## Next Steps

- Check out [Query Builder Guide](./guides/query-builder.md) for advanced queries
- Learn about [Caching Strategies](./caching.md)
- Explore [Real-World Examples](../examples/README.md)
- Read about [Performance Optimization](./guides/performance.md)

## Need Help?

- 📚 [Full Documentation](./README.md)
- 🐛 [Report Issues](https://github.com/your-username/db-bridge/issues)
- 💬 [Discussions](https://github.com/your-username/db-bridge/discussions)