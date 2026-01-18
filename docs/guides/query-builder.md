# Query Builder Guide

DB Bridge provides a powerful, chainable query builder that works across all supported databases.

## Table of Contents

- [Basic Queries](#basic-queries)
- [WHERE Clauses](#where-clauses)
- [JOINs](#joins)
- [Aggregations](#aggregations)
- [Ordering and Pagination](#ordering-and-pagination)
- [Caching](#caching)
- [Utility Methods](#utility-methods)
- [Raw Queries](#raw-queries)
- [Type Safety](#type-safety)

## Basic Queries

### SELECT

```typescript
// Get all records
const users = await db.table('users').get();

// Get first record
const user = await db.table('users').first();

// Get first or throw error
const user = await db.table('users').firstOrFail();

// Get exactly one record (throws if 0 or >1 results)
const user = await db.table('users').where('email', email).sole();

// Select specific columns
const names = await db.table('users').select('id', 'name', 'email').get();

// Add more columns to selection
const users = await db.table('users').select('id', 'name').addSelect('email', 'created_at').get();

// With conditions
const activeUsers = await db.table('users').where('active', true).where('age', '>=', 18).get();

// DISTINCT
const uniqueCategories = await db.table('products').select('category').distinct().get();
```

### INSERT

```typescript
// Single record
const user = await db.table('users').insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
});

// Multiple records
await db.table('users').insert([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' },
]);
```

### UPDATE

```typescript
// Update by condition
await db.table('users').where('id', userId).update({
  name: 'Jane Doe',
  updated_at: new Date(),
});

// Increment/Decrement
await db.table('products').where('id', productId).increment('views');

await db.table('products').where('id', productId).decrement('stock', 5);
```

### DELETE

```typescript
// Delete by condition
await db.table('users').where('id', userId).delete();

// Delete multiple
await db.table('logs').where('created_at', '<', thirtyDaysAgo).delete();
```

## JOINs

```typescript
// Inner join - pass table and ON condition as a string
const orders = await db
  .table('orders')
  .join('users', 'orders.user_id = users.id')
  .select('orders.*', 'users.name as user_name')
  .get();

// Left join
const products = await db
  .table('products')
  .leftJoin('categories', 'products.category_id = categories.id')
  .select('products.*', 'categories.name as category_name')
  .get();

// Right join
const products = await db
  .table('products')
  .rightJoin('categories', 'products.category_id = categories.id')
  .get();

// Full outer join
const combined = await db.table('table1').fullJoin('table2', 'table1.id = table2.ref_id').get();

// Cross join (no condition needed)
const combinations = await db.table('colors').crossJoin('sizes').get();

// Join with alias
const orders = await db
  .table('orders')
  .leftJoinAs('users', 'u', 'orders.user_id = u.id')
  .select('orders.*', 'u.name as customer_name')
  .get();

// Multiple joins
const orderDetails = await db
  .table('orders')
  .join('users', 'orders.user_id = users.id')
  .join('order_items', 'orders.id = order_items.order_id')
  .join('products', 'order_items.product_id = products.id')
  .select(
    'orders.id',
    'users.name as customer',
    'products.name as product',
    'order_items.quantity',
    'order_items.price',
  )
  .get();

// Join with parameter bindings
const orders = await db
  .table('orders')
  .join('users', 'orders.user_id = users.id AND users.active = ?', [true])
  .get();
```

## WHERE Clauses

```typescript
// Equality (two arguments - defaults to =)
db.table('users').where('status', 'active');

// With operator (three arguments)
db.table('users').where('age', '>', 18);

// Multiple conditions (AND)
db.table('users').where('age', '>', 18).where('active', true);

// Object syntax (multiple AND conditions)
db.table('users').where({
  status: 'active',
  role: 'admin',
});

// OR conditions
db.table('users').where('role', 'admin').orWhere('role', 'moderator');

// IN clause
db.table('users').whereIn('id', [1, 2, 3, 4, 5]);

// NOT IN
db.table('users').whereNotIn('status', ['banned', 'suspended']);

// NULL checks
db.table('users').whereNull('deleted_at');

db.table('users').whereNotNull('email_verified_at');

// BETWEEN
db.table('products').whereBetween('price', 100, 500);

// LIKE
db.table('users').whereLike('name', '%john%');

// Raw WHERE clause (for complex conditions)
db.table('products').whereRaw('price * quantity > ?', [1000]);
```

## Aggregations

```typescript
// Count
const userCount = await db.table('users').count();

// Count specific column
const emailCount = await db.table('users').count('email');

// With conditions
const activeCount = await db.table('users').where('active', true).count();

// Check existence
const hasUsers = await db.table('users').exists();
const noUsers = await db.table('users').doesntExist();

// Sum, Avg, Min, Max
const totalRevenue = await db.table('orders').sum('total');
const avgPrice = await db.table('products').avg('price');
const minPrice = await db.table('products').min('price');
const maxPrice = await db.table('products').max('price');

// Group by
const salesByCategory = await db
  .table('products')
  .join('order_items', 'products.id = order_items.product_id')
  .select('products.category', 'SUM(order_items.total) as revenue')
  .groupBy('products.category')
  .orderBy('revenue', 'DESC')
  .get();

// Having clause (raw SQL condition)
const popularCategories = await db
  .table('products')
  .select('category', 'COUNT(*) as product_count')
  .groupBy('category')
  .having('COUNT(*) > ?', [10])
  .get();

// Pluck a single column as array
const emails = await db.table('users').pluck('email');
// Result: ['john@example.com', 'jane@example.com', ...]

// Pluck as key-value Map
const userNames = await db.table('users').pluckKeyValue('name', 'id');
// Result: Map { 1 => 'John', 2 => 'Jane', ... }
```

## Ordering and Pagination

```typescript
// Order by (default ASC)
db.table('users').orderBy('created_at', 'DESC');

// Convenience methods
db.table('users').orderByDesc('created_at');
db.table('users').orderByAsc('name');

// Multiple order clauses
db.table('users').orderBy('status', 'DESC').orderBy('name', 'ASC');

// Raw order expression
db.table('products').orderByRaw('FIELD(status, "featured", "active", "inactive")');

// Clear and reorder
db.table('users')
  .orderBy('name')
  .clearOrder() // removes all order clauses
  .orderBy('id'); // add new ordering

// Or use reorder() - clears and adds in one call
db.table('users').orderBy('name').reorder('id', 'DESC');

// Limit and offset
db.table('users').limit(20).offset(40);

// Aliases: skip() and take()
db.table('users').skip(40).take(20);

// Pagination helper
const page = 2;
const perPage = 20;
db.table('users').paginate(page, perPage);

// forPage() - same as paginate, default 15 per page
db.table('users').forPage(3); // page 3, 15 items
db.table('users').forPage(3, 25); // page 3, 25 items
```

## Raw Queries

When you need more control:

```typescript
// Execute raw SQL directly
const results = await db.query('SELECT * FROM users WHERE created_at > ? AND status = ?', [
  date,
  'active',
]);

// Raw WHERE clause
const users = await db.table('users').whereRaw('DATEDIFF(NOW(), last_login) < ?', [30]).get();

// Raw ORDER BY
const products = await db
  .table('products')
  .orderByRaw('FIELD(status, "featured", "active", "inactive")')
  .get();
```

## Caching

Query results can be cached using Redis:

```typescript
// Enable cache for a query (TTL in seconds)
const products = await db
  .table('products')
  .where('featured', true)
  .cache(3600) // Cache for 1 hour
  .get();

// Cache with custom key
const user = await db
  .table('users')
  .where('id', userId)
  .cache({ key: `user:${userId}`, ttl: 1800 })
  .first();

// Cache with tags for invalidation
const posts = await db
  .table('posts')
  .where('author_id', authorId)
  .cache({ ttl: 3600, tags: ['posts', `author:${authorId}`] })
  .get();

// Disable cache for a specific query
const liveStats = await db
  .table('analytics')
  .cache(3600)
  .noCache() // Override - don't cache this query
  .get();

// Individual cache settings
db.table('products')
  .cacheTTL(7200)
  .cacheKey('featured-products')
  .cacheTags('products', 'featured')
  .get();
```

## Utility Methods

```typescript
// Clone a query builder
const baseQuery = db.table('users').where('active', true);
const admins = await baseQuery.clone().where('role', 'admin').get();
const moderators = await baseQuery.clone().where('role', 'moderator').get();

// Process large results in chunks
await db.table('users').chunk(100, async (users, chunkNumber) => {
  console.log(`Processing chunk ${chunkNumber}`);
  for (const user of users) {
    await processUser(user);
  }
  // Return false to stop chunking early
  // return false;
});

// Lazy iteration with async generator (memory efficient)
for await (const user of db.table('users').lazy(100)) {
  await processUser(user);
}

// Debug: log SQL without executing
db.table('users').where('active', true).dump();
// Logs: SQL: SELECT * FROM users WHERE active = ?
// Logs: Bindings: [true]

// Debug: log SQL and execute
const users = await db.table('users').where('active', true).dd(); // dumps and returns results
```

## Type Safety

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

// Type-safe queries with SelectBuilder<T>
const users = await db.table<User>('users').where('active', true).get();

// users is User[]
users.forEach((user) => {
  console.log(user.name); // TypeScript knows this exists
});

// Typed first()
const user = await db.table<User>('users').first();
// user is User | null

// Typed sole()
const user = await db.table<User>('users').where('email', email).sole();
// user is User (throws if not exactly one result)
```

## Performance Tips

1. **Select only needed columns**

   ```typescript
   // Good
   db.table('users').select('id', 'name', 'email');

   // Avoid when possible
   db.table('users'); // defaults to SELECT *
   ```

2. **Use indexes** - Ensure columns used in WHERE and JOIN have indexes

3. **Limit results**

   ```typescript
   // Always use limit for large tables
   db.table('logs').orderByDesc('created_at').limit(100);
   ```

4. **Use chunking for large datasets**

   ```typescript
   // Process in batches instead of loading all at once
   await db.table('users').chunk(500, async (users) => {
     await processUsers(users);
   });
   ```

5. **Use caching for expensive queries**

   ```typescript
   db.table('analytics')
     .groupBy('category')
     .select('category', 'SUM(revenue) as total')
     .cache(3600)
     .get();
   ```

6. **Clone queries** to avoid rebuilding complex base queries
   ```typescript
   const base = db.table('orders').join('users', 'orders.user_id = users.id');
   const pending = await base.clone().where('status', 'pending').get();
   const shipped = await base.clone().where('status', 'shipped').get();
   ```
