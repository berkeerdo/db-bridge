# DB Bridge Examples

Comprehensive examples demonstrating the full capabilities of DB Bridge across different databases and real-world scenarios.

## 📁 Directory Structure

```
examples/
├── mysql/                    # MySQL specific examples
│   ├── 01-basic-crud.ts     # Complete CRUD operations
│   ├── 02-advanced-queries.ts # JSON, spatial, full-text search
│   └── 03-performance.ts     # Optimization techniques
├── postgresql/               # PostgreSQL specific examples
│   ├── 01-basic-crud.ts     # CRUD with PostgreSQL features
│   ├── 02-advanced.ts        # Arrays, JSONB, CTEs
│   └── 03-extensions.ts      # PostGIS, full-text, etc.
├── redis/                    # Redis examples
│   ├── 01-basic-operations.ts # Key-value, lists, sets
│   ├── 02-caching.ts         # Caching strategies
│   └── 03-pub-sub.ts         # Real-time features
├── real-world/               # Complete applications
│   ├── 01-e-commerce-backend.ts # Full e-commerce system
│   ├── 02-blog-platform.ts   # Blog with comments, tags
│   ├── 03-analytics-system.ts # Data warehouse, reporting
│   └── 04-social-network.ts  # User connections, feeds
├── advanced/                 # Advanced patterns
│   ├── 01-microservices.ts   # Service communication
│   ├── 02-event-sourcing.ts  # Event-driven architecture
│   ├── 03-cqrs.ts           # Command Query Separation
│   └── 04-multi-tenant.ts    # SaaS architecture
└── migrations/               # Database migrations
    ├── 01-schema-setup.ts    # Initial schema
    ├── 02-seed-data.ts       # Sample data
    └── 03-migrations.ts      # Schema evolution
```

## 🚀 Quick Start

### Prerequisites

1. Install dependencies:
```bash
npm install @db-bridge/core @db-bridge/mysql @db-bridge/postgresql @db-bridge/redis
```

2. Start your databases:
```bash
# MySQL
docker run -d -p 3306:3306 -e MYSQL_ROOT_PASSWORD=password mysql:8

# PostgreSQL
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=password postgres:15

# Redis
docker run -d -p 6379:6379 redis:7
```

### Running Examples

```bash
# Basic examples
npx ts-node examples/01-getting-started.ts

# Specific database
npx ts-node examples/mysql/01-basic-crud.ts

# Real-world application
npx ts-node examples/real-world/01-e-commerce-backend.ts
```

## 📚 Example Categories

### Basic Examples (Root Directory)

1. **01-getting-started.ts**
   - First steps with DB Bridge
   - Connecting to databases
   - Basic queries
   - Simple CRUD operations

2. **02-query-builder.ts**
   - Query builder fundamentals
   - Complex WHERE conditions
   - Joins and aggregations
   - Raw queries

3. **03-transactions.ts**
   - Transaction basics
   - Nested transactions
   - Savepoints
   - Error handling

4. **04-pool-configuration.ts**
   - Connection pool setup
   - Performance tuning
   - Monitoring
   - Different scenarios

5. **05-caching-strategies.ts**
   - Redis integration
   - Cache patterns
   - Invalidation
   - Performance optimization

6. **06-high-traffic-patterns.ts**
   - Circuit breakers
   - Request batching
   - Rate limiting
   - Load balancing

### MySQL Examples

**01-basic-crud.ts**
- Complete CRUD operations
- Bulk operations
- Prepared statements
- Index optimization
- Complex queries with JOINs
- Subqueries and CTEs
- Window functions

**02-advanced-queries.ts**
- JSON column operations
- Full-text search
- Spatial queries (GIS)
- Stored procedures
- Views and triggers
- Performance analysis

### PostgreSQL Examples

**01-basic-crud.ts**
- PostgreSQL-specific features
- Array operations
- JSONB data type
- Advanced data types
- Sequences and SERIAL

**02-advanced.ts**
- Complex CTEs
- Recursive queries
- Window functions
- Table partitioning
- Foreign data wrappers

### Redis Examples

**01-basic-operations.ts**
- Key-value operations
- Lists and queues
- Sets and sorted sets
- Hashes
- Pub/Sub messaging
- Transactions

**02-caching.ts**
- Cache-aside pattern
- Write-through cache
- Cache invalidation
- TTL management
- Memory optimization

### Real-World Applications

**01-e-commerce-backend.ts**
- User authentication
- Product catalog
- Shopping cart
- Order processing
- Inventory management
- Payment integration
- Analytics dashboard

**02-blog-platform.ts**
- Article management
- Comments system
- Tags and categories
- Search functionality
- User roles
- Content moderation

**03-analytics-system.ts**
- Data ingestion
- ETL pipelines
- Aggregations
- Report generation
- Real-time dashboards
- Data warehousing

### Advanced Patterns

**01-microservices.ts**
- Service discovery
- Inter-service communication
- Distributed transactions
- Event bus
- API gateway

**02-event-sourcing.ts**
- Event store
- Event replay
- Snapshots
- Projections
- CQRS integration

## 🔧 Configuration Examples

### Development Configuration
```typescript
const db = DBBridge.mysql({
  host: 'localhost',
  database: 'dev_db',
  pool: {
    min: 1,
    max: 5
  }
});
```

### Production Configuration
```typescript
const db = DBBridge.mysql({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: true,
  pool: {
    min: 10,
    max: 100,
    acquireTimeout: 30000,
    idleTimeout: 60000,
    validateOnBorrow: true
  }
});
```

### High-Traffic Configuration
```typescript
const db = DBBridge.mysql({
  host: 'primary.db.cluster',
  database: 'production',
  pool: {
    min: 20,
    max: 200,
    queueLimit: 1000,
    enableKeepAlive: true
  }
});
```

## 📊 Performance Tips

1. **Use Connection Pools**: Always configure appropriate pool sizes
2. **Index Your Queries**: Ensure proper database indexes
3. **Cache Frequently**: Use Redis for repeated queries
4. **Batch Operations**: Group multiple operations
5. **Monitor Performance**: Track pool stats and query times

## 🛠️ Troubleshooting

### Connection Issues
```typescript
// Enable detailed logging
const db = DBBridge.mysql({
  host: 'localhost',
  database: 'test',
  options: {
    logging: true,
    logger: console
  }
});
```

### Type Errors
```typescript
// Use proper TypeScript types
interface User {
  id: number;
  name: string;
  email: string;
}

const users = await db.table<User>('users').get();
```

### Performance Problems
```typescript
// Monitor pool statistics
setInterval(() => {
  const stats = db.getAdapter()?.getPoolStats();
  console.log('Pool stats:', stats);
}, 5000);
```

## 📝 Best Practices

1. **Always use transactions** for related operations
2. **Validate input data** before database operations
3. **Use prepared statements** for repeated queries
4. **Handle errors gracefully** with try-catch blocks
5. **Close connections** when done
6. **Use appropriate data types** in your schema
7. **Index foreign keys** and frequently queried columns
8. **Monitor and log** important operations
9. **Use caching** for expensive queries
10. **Keep queries simple** and optimize when needed

## 🤝 Contributing

Feel free to add more examples! Follow these guidelines:

1. Use clear, descriptive filenames
2. Add comprehensive comments
3. Include error handling
4. Show both basic and advanced usage
5. Test your examples thoroughly

## 📄 License

These examples are part of the DB Bridge project and are licensed under the MIT License.