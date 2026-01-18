# @db-bridge/mysql

MySQL adapter for DB Bridge - A comprehensive database management library.

## Installation

```bash
npm install @db-bridge/mysql @db-bridge/core
```

## Features

- Full MySQL and MariaDB support
- Connection pooling with mysql2
- Prepared statements
- Transaction management with savepoints
- Bulk operations
- TypeScript support
- Query builder integration

## Quick Start

```typescript
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter();

// Connect
await adapter.connect({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'myapp',
});

// Simple query
const users = await adapter.query('SELECT * FROM users WHERE active = ?', [true]);

// Query builder
const qb = adapter.createQueryBuilder();
const results = await qb
  .select('*')
  .from('users')
  .where('age', '>', 18)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .execute();

// Disconnect
await adapter.disconnect();
```

## Configuration

### Connection Options

```typescript
interface MySQLConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl?: SslOptions;
  timezone?: string;
  charset?: string;
  connectionLimit?: number;
  queueLimit?: number;
  waitForConnections?: boolean;
  connectTimeout?: number;
  timeout?: number;
}
```

### Adapter Options

```typescript
const adapter = new MySQLAdapter({
  // Logger instance (optional)
  logger: console,

  // Retry options
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000,
  },

  // MySQL2 specific options
  mysql2Options: {
    ssl: {
      ca: fs.readFileSync('ca-cert.pem'),
      rejectUnauthorized: true,
    },
    timezone: '+00:00',
    connectionLimit: 10,
    enableKeepAlive: true,
  },
});
```

## Usage

### Basic Queries

```typescript
// Simple query
const result = await adapter.query('SELECT * FROM products WHERE price > ?', [100]);

// Named placeholders (converted to ?)
const users = await adapter.query('SELECT * FROM users WHERE role = :role AND status = :status', {
  role: 'admin',
  status: 'active',
});

// Insert with auto-generated ID
const insertResult = await adapter.execute('INSERT INTO users (name, email) VALUES (?, ?)', [
  'John Doe',
  'john@example.com',
]);
console.log('Inserted ID:', insertResult.insertId);
```

### Query Builder

```typescript
const qb = adapter.createQueryBuilder();

// SELECT with joins
const orders = await qb
  .select('o.*', 'u.name as user_name', 'u.email')
  .from('orders', 'o')
  .join('users u', 'u.id = o.user_id')
  .where('o.status', '=', 'pending')
  .where('o.created_at', '>', '2024-01-01')
  .orderBy('o.created_at', 'DESC')
  .limit(20)
  .execute();

// INSERT
await qb
  .insert('products', {
    name: 'New Product',
    price: 99.99,
    stock: 100,
  })
  .execute();

// UPDATE
await qb.update('products', { price: 89.99 }).where('id', '=', 123).execute();

// DELETE
await qb.delete('products').where('discontinued', '=', true).execute();
```

### Transactions

```typescript
// Basic transaction
const transaction = await adapter.beginTransaction();

try {
  await adapter.execute('INSERT INTO accounts (name, balance) VALUES (?, ?)', ['Checking', 1000], {
    transaction,
  });

  await adapter.execute('INSERT INTO transactions (account_id, amount) VALUES (?, ?)', [1, 1000], {
    transaction,
  });

  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}

// Transaction with savepoints
const tx = await adapter.beginTransaction();

try {
  await adapter.execute('INSERT INTO logs ...', [], { transaction: tx });

  await tx.savepoint('sp1');

  try {
    await riskyOperation(tx);
  } catch (error) {
    await tx.rollbackToSavepoint('sp1');
    // Continue with transaction
  }

  await tx.commit();
} catch (error) {
  await tx.rollback();
}
```

### Prepared Statements

```typescript
// Prepare statement
const stmt = await adapter.prepare('SELECT * FROM users WHERE department = ? AND role = ?');

// Execute multiple times
const sales = await stmt.execute(['sales', 'manager']);
const engineering = await stmt.execute(['engineering', 'developer']);
const hr = await stmt.execute(['hr', 'recruiter']);

// Release when done
await stmt.release();
```

### Bulk Operations

```typescript
// Bulk insert
const users = [
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
  { name: 'User 3', email: 'user3@example.com' },
];

await adapter.createQueryBuilder().insert('users', users).execute();

// Bulk update
await adapter.execute(`
  INSERT INTO products (id, price) VALUES 
  (1, 10.99), (2, 20.99), (3, 30.99)
  ON DUPLICATE KEY UPDATE price = VALUES(price)
`);
```

### Connection Pool Management

```typescript
// Monitor pool stats
const stats = adapter.getPoolStats();
console.log('Active connections:', stats.active);
console.log('Idle connections:', stats.idle);
console.log('Queue length:', stats.waiting);

// Check connection
const isAlive = await adapter.ping();
console.log('Connection alive:', isAlive);

// Force close all connections
await adapter.disconnect();
```

## Error Handling

```typescript
import { ConnectionError, QueryError } from '@db-bridge/core';

try {
  await adapter.connect(config);
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Failed to connect:', error.message);
    // Handle connection error
  }
}

try {
  await adapter.query('SELECT * FROM non_existent_table');
} catch (error) {
  if (error instanceof QueryError) {
    console.error('Query error:', {
      code: error.code,
      message: error.message,
      sql: error.sql,
    });
  }
}
```

## MySQL-Specific Features

### JSON Support

```typescript
// Insert JSON data
await adapter.execute('INSERT INTO logs (data) VALUES (?)', [
  JSON.stringify({ action: 'login', user: 123 }),
]);

// Query JSON fields
const logs = await adapter.query("SELECT * FROM logs WHERE JSON_EXTRACT(data, '$.action') = ?", [
  'login',
]);
```

### Full-Text Search

```typescript
const results = await adapter.query(
  'SELECT * FROM articles WHERE MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)',
  ['database management'],
);
```

### Spatial Data

```typescript
// Insert point
await adapter.execute('INSERT INTO locations (name, coords) VALUES (?, ST_GeomFromText(?))', [
  'Office',
  'POINT(40.7128 -74.0060)',
]);

// Find nearby
const nearby = await adapter.query(
  `
  SELECT name, ST_Distance_Sphere(coords, ST_GeomFromText(?)) as distance
  FROM locations
  HAVING distance < 1000
  ORDER BY distance
`,
  ['POINT(40.7589 -73.9851)'],
);
```

## Best Practices

1. **Use Connection Pooling**: Always use connection pooling in production
2. **Handle Errors**: Implement proper error handling and retry logic
3. **Use Prepared Statements**: For repeated queries with different parameters
4. **Set Timeouts**: Configure appropriate connection and query timeouts
5. **Monitor Pool Stats**: Keep track of connection pool health
6. **Use Transactions**: For data consistency across multiple operations

## TypeScript Support

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

// Type-safe queries
const users = await adapter.query<User>('SELECT * FROM users WHERE id = ?', [123]);

// Type-safe query builder
const user = await adapter
  .createQueryBuilder<User>()
  .select('*')
  .from('users')
  .where('id', '=', 123)
  .first();
```

## License

MIT © Berke Erdoğan
