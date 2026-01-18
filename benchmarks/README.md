# DB Bridge Benchmarks

Performance benchmarks for DB Bridge query builder and database operations.

## Running Benchmarks

```bash
# Run query builder benchmarks
npm run benchmark

# Run all benchmarks
npm run benchmark:all
```

## What's Measured

### Query Builder Benchmarks (`query-builder.bench.ts`)

Measures SQL generation performance:

- **Simple Queries**: Basic SELECT, with columns, with WHERE
- **Complex Queries**: JOINs, GROUP BY, HAVING, ORDER BY
- **WHERE Variations**: IN, BETWEEN, LIKE, NULL checks
- **Full Complex Query**: All features combined
- **Dialect Comparison**: MySQL vs PostgreSQL
- **Builder Operations**: clone(), chaining

### Sample Results

```
▶ Simple Queries
  SELECT * FROM table                          250,000 ops/sec  (0.0040ms avg)
  SELECT with columns                          180,000 ops/sec  (0.0056ms avg)
  SELECT with WHERE                            150,000 ops/sec  (0.0067ms avg)

▶ Complex Queries
  SELECT with JOIN                             120,000 ops/sec  (0.0083ms avg)
  SELECT with multiple JOINs                    80,000 ops/sec  (0.0125ms avg)
  Complex query (all features)                  40,000 ops/sec  (0.0250ms avg)
```

## Interpreting Results

- **ops/sec**: Operations per second (higher is better)
- **avg ms**: Average time per operation in milliseconds (lower is better)

### Color Coding

- 🟢 Green: > 100,000 ops/sec (excellent)
- 🟡 Yellow: 10,000 - 100,000 ops/sec (good)
- ⚪ White: < 10,000 ops/sec (acceptable)

## Running with Real Databases

For integration benchmarks with real database connections, ensure Docker services are running:

```bash
# Start test databases
npm run docker:test:up

# Run integration benchmarks
npm run benchmark:all

# Stop databases
npm run docker:test:down
```
