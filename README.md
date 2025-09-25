# 🌉 DB Bridge - Unified Database Interface for Node.js

[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive database management library that provides a unified interface for MySQL, PostgreSQL, and Redis with built-in query building, transactions, and connection pooling.

## ✨ Why DB Bridge?

```typescript
// Simple API for multiple databases
const db = DBBridge.mysql({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'myapp'
});

await db.connect();

// Powerful query builder
const users = await db.table('users')
  .where('active', true)
  .where('age', '>', 18)
  .orderBy('created_at', 'desc')
  .get();

// Easy transactions
await db.transaction(async (trx) => {
  await trx.table('orders').insert({ user_id: 1, total: 99.99 });
  await trx.table('users').update({ last_order: new Date() }).where('id', 1);
});
```

## 🚀 Features

- **🔌 Unified API** - Same code pattern for MySQL, PostgreSQL, and Redis
- **🏗️ Query Builder** - Intuitive, chainable API for complex queries
- **🔄 Transactions** - Full transaction support with savepoints
- **🔒 Type Safety** - Written in TypeScript with full type support
- **🚀 Connection Pooling** - Built-in connection pooling for performance
- **🎯 Prepared Statements** - Secure parameterized queries
- **📦 Optional Dependencies** - Install only the databases you use
- **🔧 Extensible** - Easy to extend and customize
- **🧑‍💻 Developer Friendly** - Simple API with great DX

## 📦 Installation

DB Bridge uses optional dependencies - install only what you need:

```bash
# Core package (required)
npm install @db-bridge/core

# Choose your database (one or more) - drivers are included!
npm install @db-bridge/mysql               # For MySQL/MariaDB (includes mysql2)
npm install @db-bridge/postgresql          # For PostgreSQL (includes pg)
npm install @db-bridge/redis               # For Redis (includes ioredis)
```

### Example: Only MySQL and Redis

```bash
# If you only need MySQL and Redis
npm install @db-bridge/core @db-bridge/mysql @db-bridge/redis

# PostgreSQL features will not be available, but the rest works fine!
```

### 🎯 What's Included

Each adapter package includes its database driver:
- `@db-bridge/mysql` includes `mysql2`
- `@db-bridge/postgresql` includes `pg`
- `@db-bridge/redis` includes `ioredis`

## 🎯 Quick Start

### Basic Usage

```typescript
import { DBBridge } from '@db-bridge/core';

// Connect to your database
const db = DBBridge.mysql({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'myapp'
});

await db.connect();

// Start querying!
const users = await db.table('users').get();
const posts = await db.table('posts')
  .where('status', 'published')
  .orderBy('created_at', 'desc')
  .limit(10)
  .get();
```

### Optional Dependencies in Action

```typescript
import { DBBridge } from '@db-bridge/core';

// This works if you have MySQL installed
const mysql = DBBridge.mysql({ host: 'localhost', database: 'myapp' });
await mysql.connect(); // ✓ Works!

// This throws a helpful error if PostgreSQL is not installed
const pg = DBBridge.postgresql({ host: 'localhost', database: 'myapp' });
await pg.connect(); // ✗ Error: PostgreSQL adapter not installed. Run: npm install @db-bridge/postgresql pg

// But your app continues to work with the databases you have!
```

### Direct Adapter Usage

```typescript
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter();
await adapter.connect({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'myapp'
});

// Use query builder
const qb = adapter.createQueryBuilder();
const results = await qb
  .table('products')
  .where('category', 'electronics')
  .where('price', '<', 1000)
  .orderBy('rating', 'desc')
  .limit(20)
  .execute();
```

## 🔧 Core Concepts

### Query Builder

The query builder provides a fluent interface for constructing SQL queries:

```typescript
// SELECT with conditions
const users = await db.table('users')
  .select('id', 'name', 'email')
  .where('active', true)
  .whereIn('role', ['admin', 'moderator'])
  .whereBetween('age', [18, 65])
  .orderBy('created_at', 'desc')
  .limit(50)
  .get();

// JOIN operations
const orders = await db.table('orders')
  .join('users', 'orders.user_id', '=', 'users.id')
  .select('orders.*', 'users.name as customer_name')
  .where('orders.status', 'pending')
  .get();

// Aggregations
const stats = await db.table('orders')
  .where('created_at', '>=', '2025-01-01')
  .count();
```

### Transactions

Full transaction support with automatic rollback on errors:

```typescript
await db.transaction(async (trx) => {
  // All queries in this block run in a transaction
  const orderId = await trx.table('orders').insert({
    user_id: 1,
    total: 150.00,
    status: 'pending'
  });

  await trx.table('order_items').insert([
    { order_id: orderId, product_id: 1, quantity: 2 },
    { order_id: orderId, product_id: 3, quantity: 1 }
  ]);

  await trx.table('inventory')
    .where('product_id', 1)
    .decrement('quantity', 2);
});
```

### Prepared Statements

Use prepared statements for better performance and security:

```typescript
const stmt = await db.prepare(
  'SELECT * FROM users WHERE email = ? AND active = ?'
);

const user1 = await stmt.execute(['john@example.com', true]);
const user2 = await stmt.execute(['jane@example.com', true]);

await stmt.close();
```

## 🗄️ Database Specific Features

### PostgreSQL

```typescript
const pg = DBBridge.postgresql(config);

// JSON operations
const docs = await pg.table('documents')
  .where("data->>'status'", 'active')
  .whereRaw("data @> ?", [JSON.stringify({ type: 'report' })])
  .get();

// Full-text search
const articles = await pg.table('articles')
  .whereRaw("to_tsvector('english', content) @@ plainto_tsquery('english', ?)", ['nodejs'])
  .get();
```

### Redis

```typescript
import { RedisAdapter } from '@db-bridge/redis';

const redis = new RedisAdapter();
await redis.connect();

// Key-value operations
await redis.set('user:1', JSON.stringify({ name: 'John' }), 3600); // TTL: 1 hour
const user = JSON.parse(await redis.get('user:1'));

// Lists
await redis.commands.lpush('queue', 'task1');
const task = await redis.commands.rpop('queue');

// Sets
await redis.commands.sadd('tags', 'nodejs', 'typescript');
const tags = await redis.commands.smembers('tags');
```

## 📚 Documentation

### 📖 Guides
- [Getting Started](docs/getting-started.md)
- [Query Builder Guide](docs/guides/query-builder.md)
- [Connection Management](docs/api.md#connection-management)
- [Transactions](docs/api.md#transactions)
- [Pool Configuration](examples/04-pool-configuration.ts)
- [Caching Strategies](examples/05-caching-strategies.ts)
- [High Traffic Patterns](examples/06-high-traffic-patterns.ts)

### 💡 Examples
- **Basic**: [Getting Started](examples/01-getting-started.ts), [Query Builder](examples/02-query-builder.ts), [Transactions](examples/03-transactions.ts)
- **MySQL**: [CRUD Operations](examples/mysql/01-basic-crud.ts), [Advanced Features](examples/mysql/02-advanced-queries.ts)
- **PostgreSQL**: Coming soon
- **Redis**: Coming soon
- **Real-World**: [E-Commerce Backend](examples/real-world/01-e-commerce-backend.ts)
- **[View All Examples](examples/README.md)**

### 📋 API Reference
- [Full API Documentation](docs/api.md)
- [TypeScript Definitions](packages/core/src/types/index.ts)

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run tests for a specific adapter
npm run test packages/mysql
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT © 2025 Berke Erdoğan

## 🙏 Acknowledgments

DB Bridge is built on top of these excellent libraries:
- [mysql2](https://github.com/sidorares/node-mysql2) - MySQL client
- [pg](https://github.com/brianc/node-postgres) - PostgreSQL client
- [ioredis](https://github.com/luin/ioredis) - Redis client

---

Made with ❤️ by Berke Erdoğan