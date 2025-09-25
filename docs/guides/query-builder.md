# Query Builder Guide

DB Bridge provides a powerful, chainable query builder that works across all supported databases.

## Basic Queries

### SELECT

```typescript
// Get all records
const users = await db.table('users').get();

// Get first record
const user = await db.table('users').first();

// Select specific columns
const names = await db.table('users')
  .select('id', 'name', 'email')
  .get();

// With conditions
const activeUsers = await db.table('users')
  .where('active', true)
  .where('age', '>=', 18)
  .get();
```

### INSERT

```typescript
// Single record
const user = await db.table('users').insert({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

// Multiple records
await db.table('users').insert([
  { name: 'User 1', email: 'user1@example.com' },
  { name: 'User 2', email: 'user2@example.com' }
]);
```

### UPDATE

```typescript
// Update by condition
await db.table('users')
  .where('id', userId)
  .update({ 
    name: 'Jane Doe',
    updated_at: new Date() 
  });

// Increment/Decrement
await db.table('products')
  .where('id', productId)
  .increment('views');

await db.table('products')
  .where('id', productId)
  .decrement('stock', 5);
```

### DELETE

```typescript
// Delete by condition
await db.table('users')
  .where('id', userId)
  .delete();

// Delete multiple
await db.table('logs')
  .where('created_at', '<', thirtyDaysAgo)
  .delete();
```

## Advanced Queries

### Joins

```typescript
// Inner join
const orders = await db.table('orders')
  .join('users', 'orders.user_id', '=', 'users.id')
  .select('orders.*', 'users.name as user_name')
  .get();

// Left join
const products = await db.table('products')
  .leftJoin('categories', 'products.category_id', '=', 'categories.id')
  .select('products.*', 'categories.name as category_name')
  .get();

// Multiple joins
const orderDetails = await db.table('orders')
  .join('users', 'orders.user_id', '=', 'users.id')
  .join('order_items', 'orders.id', '=', 'order_items.order_id')
  .join('products', 'order_items.product_id', '=', 'products.id')
  .select(
    'orders.id',
    'users.name as customer',
    'products.name as product',
    'order_items.quantity',
    'order_items.price'
  )
  .get();
```

### Where Clauses

```typescript
// Basic where
db.table('users').where('age', '>', 18)

// Multiple conditions (AND)
db.table('users')
  .where('age', '>', 18)
  .where('active', true)

// OR conditions
db.table('users')
  .where('role', 'admin')
  .orWhere('role', 'moderator')

// Complex conditions
db.table('products')
  .where('category', 'electronics')
  .where(query => 
    query.where('price', '<', 100)
         .orWhere('discount', '>', 50)
  )

// IN clause
db.table('users')
  .whereIn('id', [1, 2, 3, 4, 5])

// NULL checks
db.table('users')
  .whereNull('deleted_at')

// BETWEEN
db.table('products')
  .whereBetween('price', [100, 500])

// LIKE
db.table('users')
  .where('name', 'LIKE', '%john%')
```

### Aggregations

```typescript
// Count
const userCount = await db.table('users').count();

// With conditions
const activeCount = await db.table('users')
  .where('active', true)
  .count();

// Other aggregates
const stats = await db.table('orders')
  .select(
    'COUNT(*) as total_orders',
    'SUM(total) as revenue',
    'AVG(total) as avg_order',
    'MIN(total) as min_order',
    'MAX(total) as max_order'
  )
  .where('status', 'completed')
  .first();

// Group by
const salesByCategory = await db.table('products')
  .join('order_items', 'products.id', '=', 'order_items.product_id')
  .select('products.category', 'SUM(order_items.total) as revenue')
  .groupBy('products.category')
  .orderBy('revenue', 'desc')
  .get();

// Having clause
const popularCategories = await db.table('products')
  .select('category', 'COUNT(*) as product_count')
  .groupBy('category')
  .having('COUNT(*)', '>', 10)
  .get();
```

### Ordering and Limits

```typescript
// Order by
db.table('users')
  .orderBy('created_at', 'desc')
  .orderBy('name', 'asc')

// Limit and offset (pagination)
const page = 2;
const perPage = 20;

const users = await db.table('users')
  .orderBy('id')
  .limit(perPage)
  .offset((page - 1) * perPage)
  .get();

// Get single record
const latestUser = await db.table('users')
  .orderBy('created_at', 'desc')
  .first();
```

## Raw Queries

When you need more control:

```typescript
// Raw SQL
const results = await db.query(
  'SELECT * FROM users WHERE created_at > ? AND status = ?',
  [date, 'active']
);

// Raw expressions in query builder
const users = await db.table('users')
  .select('*', db.raw('YEAR(created_at) as join_year'))
  .where(db.raw('DATEDIFF(NOW(), last_login) < ?'), 30)
  .get();
```

## Subqueries

```typescript
// Subquery in where
const admins = await db.table('users')
  .whereIn('id', 
    db.table('role_user')
      .select('user_id')
      .where('role_id', 1)
  )
  .get();

// Subquery in select
const users = await db.table('users')
  .select(
    '*',
    db.table('orders')
      .select('COUNT(*)')
      .whereRaw('orders.user_id = users.id')
      .as('order_count')
  )
  .get();
```

## Query Caching

```typescript
// Auto-cache this query
const products = await db.table('products', {
  cache: { ttl: 3600 } // 1 hour
}).where('featured', true).get();

// Disable cache for real-time data
const liveStats = await db.table('analytics', {
  cache: false
}).where('timestamp', '>', oneHourAgo).get();
```

## Type Safety

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  created_at: Date;
}

// Type-safe queries
const users = await db.table('users')
  .where('active', true)
  .get<User>();

// users is User[]
users.forEach(user => {
  console.log(user.name); // TypeScript knows this exists
});
```

## Performance Tips

1. **Select only needed columns**
   ```typescript
   // Good
   db.table('users').select('id', 'name', 'email')
   
   // Avoid
   db.table('users').select('*')
   ```

2. **Use indexes**
   ```typescript
   // Make sure you have indexes on columns used in WHERE
   db.table('users').where('email', 'john@example.com')
   ```

3. **Limit results**
   ```typescript
   // Always use limit for large tables
   db.table('logs').orderBy('created_at', 'desc').limit(100)
   ```

4. **Use caching for expensive queries**
   ```typescript
   db.table('analytics', { cache: { ttl: 3600 } })
     .groupBy('category')
     .select('category', 'SUM(revenue) as total')
   ```