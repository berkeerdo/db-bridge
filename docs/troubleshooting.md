# Troubleshooting Guide

Common issues and their solutions when using DB Bridge.

## Connection Issues

### "Connection refused" error

**Symptoms:**

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solutions:**

1. Verify the database server is running
2. Check host and port configuration
3. Ensure firewall allows the connection

```typescript
// Verify connection details
const db = DBBridge.mysql({
  host: 'localhost', // or '127.0.0.1'
  port: 3306, // default MySQL port
  user: 'root',
  password: 'password',
  database: 'myapp',
});
```

### "Access denied" error

**Symptoms:**

```
Error: Access denied for user 'root'@'localhost'
```

**Solutions:**

1. Verify username and password
2. Check user has permissions for the database
3. Ensure user can connect from the host

```sql
-- Grant permissions in MySQL
GRANT ALL PRIVILEGES ON myapp.* TO 'user'@'localhost';
FLUSH PRIVILEGES;
```

### Connection timeout

**Symptoms:**

```
Error: Connection timeout after 10000ms
```

**Solutions:**

1. Increase connection timeout
2. Check network connectivity
3. Verify database server load

```typescript
const db = DBBridge.mysql({
  host: 'remote-server',
  database: 'myapp',
  connectTimeout: 30000, // 30 seconds
});
```

## Query Issues

### "Table doesn't exist" error

**Symptoms:**

```
Error: Table 'myapp.users' doesn't exist
```

**Solutions:**

1. Verify table name spelling
2. Check database selection
3. Ensure migrations have run

```typescript
// Verify table exists
const tables = await db.query('SHOW TABLES');
console.log(tables);
```

### Incorrect query results

**Solutions:**

1. Use `dump()` to inspect generated SQL
2. Check WHERE conditions
3. Verify JOIN conditions

```typescript
// Debug query
await db.table('users').where('active', true).dump(); // Logs: SQL and bindings

// Then execute
const users = await db.table('users').where('active', true).get();
```

### TypeScript type errors

**Symptoms:**

```
Type 'unknown' is not assignable to type 'User'
```

**Solutions:**

1. Define interface for your data
2. Use generic type parameter

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Typed query
const users = await db.table<User>('users').get();
// users is User[]
```

## Performance Issues

### Slow queries

**Solutions:**

1. Add database indexes
2. Use `select()` to limit columns
3. Add `limit()` to large result sets
4. Use caching for repeated queries

```typescript
// Good: specific columns, limited results
const users = await db
  .table('users')
  .select('id', 'name', 'email')
  .where('active', true)
  .limit(100)
  .cache(3600)
  .get();

// Avoid: SELECT * without limits
const allUsers = await db.table('users').get();
```

### Connection pool exhaustion

**Symptoms:**

```
Error: No available connections in pool
```

**Solutions:**

1. Increase pool size
2. Ensure connections are released
3. Check for connection leaks

```typescript
// Increase pool size
const db = DBBridge.mysql({
  host: 'localhost',
  database: 'myapp',
  connectionLimit: 50, // Increase from default 10
});

// Monitor pool stats
const stats = db.getAdapter()?.getPoolStats();
console.log('Pool stats:', stats);
```

### Memory issues

**Solutions:**

1. Use `chunk()` for large datasets
2. Use `lazy()` for streaming
3. Select only needed columns

```typescript
// Process large datasets in chunks
await db
  .table('logs')
  .where('created_at', '<', oneWeekAgo)
  .chunk(1000, async (logs) => {
    await processLogs(logs);
  });

// Or use lazy iteration
for await (const log of db.table('logs').lazy(100)) {
  await processLog(log);
}
```

## Transaction Issues

### "Transaction already started" error

**Solutions:**

1. Ensure proper transaction scope
2. Don't nest transactions incorrectly

```typescript
// Correct: single transaction block
await db.transaction(async (trx) => {
  await trx.table('orders').insert(order);
  await trx.table('inventory').update(inventory);
});

// Incorrect: don't call beginTransaction inside transaction
await db.transaction(async (trx) => {
  await trx.beginTransaction(); // Wrong!
});
```

### Deadlocks

**Solutions:**

1. Keep transactions short
2. Access tables in consistent order
3. Use appropriate isolation level

```typescript
// Use lower isolation level if appropriate
const trx = await db.beginTransaction({
  isolationLevel: 'READ COMMITTED',
});
```

## Caching Issues

### Cache not working

**Solutions:**

1. Verify Redis connection
2. Check cache configuration
3. Ensure `cache()` is called

```typescript
// Verify Redis is connected
const redis = new RedisAdapter();
await redis.connect({ host: 'localhost', port: 6379 });
const pong = await redis.ping();
console.log('Redis:', pong); // Should be 'PONG'
```

### Stale cache data

**Solutions:**

1. Set appropriate TTL
2. Invalidate cache on updates
3. Use cache tags for bulk invalidation

```typescript
// Use shorter TTL for frequently changing data
const products = await db
  .table('products')
  .cache({ ttl: 60, tags: ['products'] }) // 1 minute
  .get();

// Invalidate on update
await db.table('products').where('id', productId).update(data);
await redis.deleteByTag('products');
```

## Getting Help

If you're still having issues:

1. Check the [GitHub Issues](https://github.com/berkeerdo/db-bridge/issues)
2. Search for similar problems
3. Create a new issue with:
   - DB Bridge version
   - Database type and version
   - Error message and stack trace
   - Minimal reproduction code
