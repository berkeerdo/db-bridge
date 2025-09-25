# DB Bridge

Unified database adapter for Node.js with MySQL, PostgreSQL, and Redis support.

## Installation

### Install everything (recommended for new projects):
```bash
npm install db-bridge
```

### Or install only what you need:
```bash
# Core + MySQL only
npm install @db-bridge/core @db-bridge/mysql

# Core + Redis only  
npm install @db-bridge/core @db-bridge/redis

# Core + PostgreSQL only
npm install @db-bridge/core @db-bridge/postgresql
```

## Quick Start

```javascript
import { DBBridge } from 'db-bridge';
// or
const { DBBridge } = require('db-bridge');

// MySQL
const mysql = DBBridge.mysql({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydb'
});

// PostgreSQL
const pg = DBBridge.postgresql({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'mydb'
});

// Redis
const redis = DBBridge.redis({
  host: 'localhost',
  port: 6379
});

// Connect and use
await mysql.connect();
const users = await mysql.query('SELECT * FROM users');
await mysql.disconnect();
```

## Why DB Bridge?

- 🚀 **Unified API** - Same interface for all databases
- 📦 **Optional Dependencies** - Install only what you need
- 🔄 **Auto Driver Installation** - Database drivers are included
- 💪 **TypeScript Support** - Full type safety
- 🏊 **Connection Pooling** - Built-in pool management
- 🔒 **Transactions** - ACID compliance
- 🔍 **Query Builder** - Type-safe query construction
- ⚡ **Redis Integration** - Built-in caching support

## Features

### Consistent API
```javascript
// Same methods work across all databases
await db.connect();
await db.query('SELECT * FROM users');
await db.execute('INSERT INTO users VALUES (?, ?)', ['John', 'john@example.com']);
await db.disconnect();
```

### Query Builder
```javascript
const users = await db
  .createQueryBuilder()
  .table('users')  // or .from('users')
  .select('id', 'name', 'email')
  .where('active', '=', true)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .execute();
```

### Transactions
```javascript
const trx = await db.beginTransaction();
try {
  await trx.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]);
  await trx.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [100, 2]);
  await trx.commit();
} catch (error) {
  await trx.rollback();
}
```

### Redis Caching
```javascript
const cache = DBBridge.redis();
await cache.connect();

// Basic operations
await cache.set('key', { data: 'value' }, 3600); // 1 hour TTL
const data = await cache.get('key');
await cache.del('key');

// Redis commands
const redis = cache.getAdapter();
await redis.commands.lpush('queue', 'task1', 'task2');
await redis.commands.hset('user:1', 'name', 'John');
```

## License

MIT