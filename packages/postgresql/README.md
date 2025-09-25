# @db-bridge/postgresql

PostgreSQL adapter for DB Bridge - A comprehensive database management library.

## Installation

```bash
npm install @db-bridge/postgresql @db-bridge/core
```

## Features

- Full PostgreSQL support (9.5+)
- Connection pooling with pg
- Prepared statements
- Advanced transaction management with savepoints and isolation levels
- JSONB and array support
- TypeScript support
- Query builder integration

## Quick Start

```typescript
import { PostgreSQLAdapter } from '@db-bridge/postgresql';

const adapter = new PostgreSQLAdapter();

// Connect
await adapter.connect({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'myapp'
});

// Simple query
const users = await adapter.query('SELECT * FROM users WHERE active = $1', [true]);

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
interface PostgreSQLConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean | TlsOptions;
  connectionTimeoutMillis?: number;
  idle_in_transaction_session_timeout?: number;
  statement_timeout?: number;
  query_timeout?: number;
  application_name?: string;
  max?: number; // Pool size
}
```

### Adapter Options

```typescript
const adapter = new PostgreSQLAdapter({
  // Logger instance (optional)
  logger: console,
  
  // Parse PostgreSQL types automatically
  parseTypes: true,
  
  // Retry options
  retryOptions: {
    maxRetries: 3,
    retryDelay: 1000
  },
  
  // pg specific options
  pgOptions: {
    ssl: {
      rejectUnauthorized: false,
      ca: fs.readFileSync('server-ca.pem')
    },
    statement_timeout: 30000,
    query_timeout: 60000,
    connectionTimeoutMillis: 10000
  }
});
```

## Usage

### Basic Queries

```typescript
// Parameterized query with $1, $2 placeholders
const result = await adapter.query(
  'SELECT * FROM products WHERE price > $1 AND category = $2',
  [100, 'electronics']
);

// RETURNING clause
const inserted = await adapter.query(
  'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
  ['John Doe', 'john@example.com']
);
console.log('Inserted user:', inserted.rows[0]);
```

### Query Builder

```typescript
const qb = adapter.createQueryBuilder();

// Complex query with CTEs
const query = qb
  .with('active_users', qb => 
    qb.select('*').from('users').where('active', '=', true)
  )
  .select('au.*', 'COUNT(o.id) as order_count')
  .from('active_users', 'au')
  .join('orders o', 'o.user_id = au.id', 'LEFT')
  .groupBy('au.id')
  .having('COUNT(o.id)', '>', 5)
  .orderBy('order_count', 'DESC');

const results = await query.execute();
```

### Transactions

```typescript
// Basic transaction
const transaction = await adapter.beginTransaction();

try {
  await adapter.execute(
    'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
    [100, 1],
    { transaction }
  );
  
  await adapter.execute(
    'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
    [100, 2],
    { transaction }
  );
  
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}

// Transaction with isolation level
const tx = await adapter.beginTransaction({
  isolationLevel: IsolationLevel.SERIALIZABLE
});

// Savepoints
await tx.savepoint('before_update');

try {
  await riskyOperation(tx);
} catch (error) {
  await tx.rollbackToSavepoint('before_update');
  // Continue transaction
}

await tx.commit();
```

### PostgreSQL-Specific Features

#### JSONB Support

```typescript
// Insert JSONB data
await adapter.execute(
  'INSERT INTO products (name, attributes) VALUES ($1, $2)',
  ['Laptop', { brand: 'Dell', specs: { ram: '16GB', ssd: '512GB' } }]
);

// Query JSONB fields
const products = await adapter.query(
  "SELECT * FROM products WHERE attributes->>'brand' = $1",
  ['Dell']
);

// JSONB operators
const results = await adapter.query(
  "SELECT * FROM products WHERE attributes @> $1",
  [{ brand: 'Dell' }]
);
```

#### Array Types

```typescript
// Insert arrays
await adapter.execute(
  'INSERT INTO posts (title, tags) VALUES ($1, $2)',
  ['PostgreSQL Arrays', ['database', 'postgresql', 'arrays']]
);

// Query arrays
const posts = await adapter.query(
  'SELECT * FROM posts WHERE tags @> $1',
  [['postgresql']]
);

// Array functions
const tagged = await adapter.query(
  'SELECT * FROM posts WHERE $1 = ANY(tags)',
  ['database']
);
```

#### Full-Text Search

```typescript
// Create text search vector
await adapter.execute(`
  ALTER TABLE articles 
  ADD COLUMN search_vector tsvector 
  GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || content)
  ) STORED
`);

// Full-text search
const results = await adapter.query(
  "SELECT * FROM articles WHERE search_vector @@ plainto_tsquery('english', $1)",
  ['database management']
);
```

#### Window Functions

```typescript
const analytics = await adapter.query(`
  SELECT 
    user_id,
    created_at,
    amount,
    SUM(amount) OVER (PARTITION BY user_id ORDER BY created_at) as running_total,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY amount DESC) as rank
  FROM transactions
  WHERE created_at > $1
`, ['2024-01-01']);
```

#### UPSERT (INSERT ... ON CONFLICT)

```typescript
await adapter.execute(`
  INSERT INTO user_settings (user_id, key, value) 
  VALUES ($1, $2, $3)
  ON CONFLICT (user_id, key) 
  DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
`, [123, 'theme', 'dark']);
```

### Prepared Statements

```typescript
// Named prepared statement
const stmt = await adapter.prepare(
  'SELECT * FROM orders WHERE user_id = $1 AND status = $2',
  'getUserOrders'
);

// Execute multiple times
const pendingOrders = await stmt.execute([123, 'pending']);
const completedOrders = await stmt.execute([123, 'completed']);

// Release when done
await stmt.release();
```

### Connection Pool Management

```typescript
// Get pool statistics
const stats = adapter.getPoolStats();
console.log('Total connections:', stats.total);
console.log('Idle connections:', stats.idle);
console.log('Active connections:', stats.active);
console.log('Waiting clients:', stats.waiting);

// Test connection
const isAlive = await adapter.ping();

// Listen to pool events
adapter.on('connect', (client) => {
  console.log('New client connected');
});

adapter.on('error', (err, client) => {
  console.error('Pool error:', err);
});
```

### COPY Operations

```typescript
// COPY FROM for bulk insert
const copyStream = adapter.copyFrom(
  'COPY users (name, email) FROM STDIN WITH (FORMAT csv)'
);

copyStream.write('John Doe,john@example.com\n');
copyStream.write('Jane Smith,jane@example.com\n');
copyStream.end();

// COPY TO for export
const outputStream = adapter.copyTo(
  'COPY users TO STDOUT WITH (FORMAT csv, HEADER true)'
);

outputStream.pipe(fs.createWriteStream('users.csv'));
```

### Listen/Notify

```typescript
// Listen for notifications
await adapter.execute('LISTEN user_updates');

adapter.on('notification', (msg) => {
  console.log('Notification received:', msg.channel, msg.payload);
});

// Send notification
await adapter.execute(
  'NOTIFY user_updates, $1',
  [JSON.stringify({ userId: 123, action: 'updated' })]
);
```

## Advanced Features

### Cursors

```typescript
// Server-side cursor for large result sets
const cursor = await adapter.cursor(
  'SELECT * FROM large_table WHERE created_at > $1',
  ['2024-01-01']
);

let rows;
while ((rows = await cursor.read(100)).length > 0) {
  // Process batch of 100 rows
  await processBatch(rows);
}

await cursor.close();
```

### Type Parsing

```typescript
// Custom type parsing
adapter.setTypeParser(1082, (val) => {
  // Parse date type as moment
  return moment(val);
});

// Built-in parsing for common types
const result = await adapter.query('SELECT NOW() as time, 123::int8 as bigint');
console.log(typeof result.rows[0].bigint); // 'bigint' in Node.js 10.4+
```

## Error Handling

```typescript
import { ConnectionError, QueryError } from '@db-bridge/core';

try {
  await adapter.query('SELECT * FROM users');
} catch (error) {
  if (error instanceof QueryError) {
    switch (error.code) {
      case '23505': // unique_violation
        console.error('Duplicate key error');
        break;
      case '23503': // foreign_key_violation
        console.error('Foreign key constraint error');
        break;
      case '42P01': // undefined_table
        console.error('Table does not exist');
        break;
    }
  }
}
```

## Best Practices

1. **Use Parameterized Queries**: Always use $1, $2 placeholders
2. **Set Statement Timeout**: Prevent long-running queries
3. **Use Connection Pooling**: Configure appropriate pool size
4. **Handle JSON Types**: Use native JavaScript objects with JSONB
5. **Use Transactions**: For data consistency
6. **Monitor Pool Health**: Track connection pool statistics

## TypeScript Support

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  metadata: {
    role: string;
    department?: string;
  };
  tags: string[];
  created_at: Date;
}

// Type-safe queries
const users = await adapter.query<User>(
  'SELECT * FROM users WHERE id = $1',
  [123]
);

// Type-safe query builder
const user = await adapter
  .createQueryBuilder<User>()
  .select('*')
  .from('users')
  .where('metadata->>"role"', '=', 'admin')
  .first();
```

## License

MIT © Berke Erdoğan