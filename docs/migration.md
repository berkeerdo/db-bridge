# Migration Guide

## Table of Contents

- [Migrating from Raw Database Drivers](#migrating-from-raw-database-drivers)
  - [From mysql2](#from-mysql2)
  - [From pg](#from-pg)  
  - [From ioredis](#from-ioredis)
- [Migrating from Other ORMs/Query Builders](#migrating-from-other-ormsquery-builders)
  - [From Knex.js](#from-knexjs)
  - [From TypeORM](#from-typeorm)
  - [From Sequelize](#from-sequelize)
- [Migration Strategies](#migration-strategies)
- [Common Patterns](#common-patterns)
- [Troubleshooting](#troubleshooting)

## Migrating from Raw Database Drivers

### From mysql2

If you're currently using `mysql2` directly:

#### Before (mysql2)
```javascript
const mysql = require('mysql2/promise');

const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'myapp'
});

const [rows] = await connection.execute(
  'SELECT * FROM users WHERE role = ?',
  ['admin']
);

await connection.end();
```

#### After (DB Bridge)
```typescript
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter();

await adapter.connect({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'myapp'
});

const result = await adapter.query(
  'SELECT * FROM users WHERE role = ?',
  ['admin']
);
const rows = result.rows;

await adapter.disconnect();
```

#### Key Differences
1. **Connection Pooling**: DB Bridge uses connection pooling by default
2. **Result Format**: Results are wrapped in a `QueryResult` object
3. **Error Handling**: Typed errors for better error handling
4. **TypeScript**: Full TypeScript support with type inference

### From pg

If you're currently using `pg` (node-postgres):

#### Before (pg)
```javascript
const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  user: 'postgres',
  password: 'password',
  database: 'myapp'
});

await client.connect();

const result = await client.query(
  'SELECT * FROM users WHERE role = $1',
  ['admin']
);

await client.end();
```

#### After (DB Bridge)
```typescript
import { PostgreSQLAdapter } from '@db-bridge/postgresql';

const adapter = new PostgreSQLAdapter();

await adapter.connect({
  host: 'localhost',
  user: 'postgres', 
  password: 'password',
  database: 'myapp'
});

const result = await adapter.query(
  'SELECT * FROM users WHERE role = $1',
  ['admin']
);

await adapter.disconnect();
```

#### Key Differences
1. **Unified API**: Same API across different databases
2. **Query Builder**: Built-in query builder for complex queries
3. **Transaction Management**: Enhanced transaction support with savepoints
4. **Prepared Statements**: Simplified prepared statement API

### From ioredis

If you're currently using `ioredis`:

#### Before (ioredis)
```javascript
const Redis = require('ioredis');
const redis = new Redis();

await redis.set('user:123', JSON.stringify({ name: 'John' }));
const data = await redis.get('user:123');
const user = JSON.parse(data);

redis.disconnect();
```

#### After (DB Bridge)
```typescript
import { RedisAdapter } from '@db-bridge/redis';

const redis = new RedisAdapter();
await redis.connect({ host: 'localhost' });

await redis.set('user:123', { name: 'John' });
const user = await redis.get('user:123');

await redis.disconnect();
```

#### Key Differences
1. **Automatic JSON Handling**: Automatic serialization/deserialization
2. **Unified API**: Consistent with other DB Bridge adapters
3. **Caching Layer**: Can be used as a caching layer for other databases
4. **TTL Management**: Built-in TTL support in all methods

## Migrating from Other ORMs/Query Builders

### From Knex.js

#### Before (Knex.js)
```javascript
const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'myapp'
  }
});

const users = await knex('users')
  .where('role', 'admin')
  .orderBy('created_at', 'desc')
  .limit(10);

await knex.destroy();
```

#### After (DB Bridge)
```typescript
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter();
await adapter.connect({...});

const qb = adapter.createQueryBuilder();
const users = await qb
  .select('*')
  .from('users')
  .where('role', '=', 'admin')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .execute();

await adapter.disconnect();
```

### From TypeORM

#### Before (TypeORM)
```typescript
@Entity()
class User {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  name: string;
  
  @Column()
  role: string;
}

const users = await userRepository.find({
  where: { role: 'admin' },
  order: { createdAt: 'DESC' },
  take: 10
});
```

#### After (DB Bridge with Repository Pattern)
```typescript
class UserRepository {
  constructor(private adapter: DatabaseAdapter) {}
  
  async findByRole(role: string, limit: number = 10) {
    const qb = this.adapter.createQueryBuilder<User>();
    return qb
      .select('*')
      .from('users')
      .where('role', '=', role)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .execute();
  }
}

const userRepo = new UserRepository(adapter);
const users = await userRepo.findByRole('admin');
```

### From Sequelize

#### Before (Sequelize)
```javascript
const User = sequelize.define('User', {
  name: DataTypes.STRING,
  role: DataTypes.STRING
});

const users = await User.findAll({
  where: { role: 'admin' },
  order: [['createdAt', 'DESC']],
  limit: 10
});
```

#### After (DB Bridge)
```typescript
const adapter = new MySQLAdapter();
const qb = adapter.createQueryBuilder();

const users = await qb
  .select('*')
  .from('users')
  .where('role', '=', 'admin')
  .orderBy('created_at', 'DESC')
  .limit(10)
  .execute();
```

## Migration Strategies

### 1. Gradual Migration

Start by migrating one module at a time:

```typescript
// Phase 1: Create adapter alongside existing code
const adapter = new MySQLAdapter();
await adapter.connect(config);

// Phase 2: Migrate simple queries first
// Old code
const [rows] = await mysql.execute('SELECT * FROM users');

// New code
const result = await adapter.query('SELECT * FROM users');

// Phase 3: Migrate complex operations
// Phase 4: Remove old database driver
```

### 2. Parallel Implementation

Run both implementations in parallel during transition:

```typescript
class UserService {
  constructor(
    private oldDb: mysql.Connection,
    private newDb: DatabaseAdapter
  ) {}
  
  async getUsers() {
    // Run both implementations
    const [oldResult] = await this.oldDb.execute('SELECT * FROM users');
    const newResult = await this.newDb.query('SELECT * FROM users');
    
    // Compare results in development
    if (process.env['NODE_ENV'] === 'development') {
      assert.deepEqual(oldResult, newResult.rows);
    }
    
    // Return new implementation
    return newResult.rows;
  }
}
```

### 3. Feature Flag Migration

Use feature flags to switch between implementations:

```typescript
class DatabaseService {
  private adapter?: DatabaseAdapter;
  private legacyDb?: any;
  
  async query(sql: string, params?: any[]) {
    if (featureFlags.useNewDatabase) {
      return this.adapter.query(sql, params);
    } else {
      return this.legacyDb.query(sql, params);
    }
  }
}
```

## Common Patterns

### Connection Management

#### Old Pattern
```javascript
// Create connection for each request
app.get('/users', async (req, res) => {
  const conn = await mysql.createConnection(config);
  try {
    const [rows] = await conn.execute('SELECT * FROM users');
    res.json(rows);
  } finally {
    await conn.end();
  }
});
```

#### New Pattern
```typescript
// Use connection pool (initialized once)
const adapter = new MySQLAdapter();
await adapter.connect(config);

app.get('/users', async (req, res) => {
  const result = await adapter.query('SELECT * FROM users');
  res.json(result.rows);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await adapter.disconnect();
});
```

### Transaction Handling

#### Old Pattern
```javascript
const conn = await mysql.getConnection();
await conn.beginTransaction();

try {
  await conn.execute('INSERT INTO ...');
  await conn.execute('UPDATE ...');
  await conn.commit();
} catch (error) {
  await conn.rollback();
  throw error;
} finally {
  conn.release();
}
```

#### New Pattern
```typescript
const tx = await adapter.beginTransaction();

try {
  await adapter.execute('INSERT INTO ...', [], { transaction: tx });
  await adapter.execute('UPDATE ...', [], { transaction: tx });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

### Error Handling

#### Old Pattern
```javascript
try {
  await connection.execute(sql);
} catch (error) {
  if (error.code === 'ER_DUP_ENTRY') {
    // Handle duplicate
  } else if (error.code === 'ER_NO_REFERENCED_ROW') {
    // Handle foreign key
  }
}
```

#### New Pattern
```typescript
import { QueryError } from '@db-bridge/core';

try {
  await adapter.execute(sql);
} catch (error) {
  if (error instanceof QueryError) {
    switch (error.code) {
      case 'DUPLICATE_ENTRY':
        // Handle duplicate
        break;
      case 'FOREIGN_KEY_VIOLATION':
        // Handle foreign key
        break;
    }
  }
}
```

## Troubleshooting

### Connection Issues

**Problem**: "Connection refused" errors

**Solution**: 
1. Check connection configuration matches your database
2. Ensure database service is running
3. Verify network connectivity
4. Check firewall rules

```typescript
// Enable debug logging
const adapter = new MySQLAdapter({
  logger: console,
  mysql2Options: {
    debug: true
  }
});
```

### Performance Issues

**Problem**: Queries are slower than before

**Solution**:
1. Check connection pool settings
2. Enable prepared statements for repeated queries
3. Use query builder for complex queries (better optimization)

```typescript
// Optimize connection pool
await adapter.connect({
  ...config,
  connectionLimit: 20,
  queueLimit: 0
});

// Use prepared statements
const stmt = await adapter.prepare('SELECT * FROM users WHERE id = ?');
```

### Type Errors

**Problem**: TypeScript errors after migration

**Solution**:
1. Add type annotations to queries
2. Use query builder for better type inference
3. Define interfaces for your data

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Type your queries
const users = await adapter.query<User>('SELECT * FROM users');

// Or use query builder
const users = await adapter
  .createQueryBuilder<User>()
  .select('*')
  .from('users')
  .execute();
```

### Memory Leaks

**Problem**: Memory usage increases over time

**Solution**:
1. Ensure you're using connection pooling
2. Release prepared statements when done
3. Close transactions properly
4. Monitor pool statistics

```typescript
// Monitor pool health
setInterval(() => {
  const stats = adapter.getPoolStats();
  console.log('Pool stats:', stats);
  
  if (stats.waiting > 10) {
    console.warn('Many connections waiting!');
  }
}, 60000);
```

## Getting Help

If you encounter issues during migration:

1. Check the [examples](../examples/) directory
2. Review the [API documentation](./api.md)
3. Search [GitHub issues](https://github.com/berkeerdogan/db-bridge/issues)
4. Create a new issue with:
   - Your current setup
   - Migration approach
   - Error messages
   - Minimal reproduction