# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-18

### Added

- **Core Package** (`@db-bridge/core`)
  - Unified database interface with adapter pattern
  - Fluent query builder with full SQL support
  - SELECT, INSERT, UPDATE, DELETE builders
  - JOIN support (INNER, LEFT, RIGHT, FULL, CROSS)
  - WHERE clause builder with all operators
  - Aggregation functions (COUNT, SUM, AVG, MIN, MAX)
  - GROUP BY and HAVING support
  - ORDER BY with multiple columns and directions
  - Pagination helpers (limit, offset, paginate, forPage)
  - Transaction support with savepoints
  - Connection pooling
  - Query caching with Redis integration
  - Field-level encryption/decryption
  - Middleware system (retry, logging, cache, timeout)
  - Health checks and metrics collection
  - Performance monitoring
  - TypeScript support with full type definitions

- **MySQL Adapter** (`@db-bridge/mysql`)
  - Full MySQL 8.0+ support
  - Connection pooling with mysql2
  - Prepared statements
  - Transaction management
  - JSON column support
  - Bulk operations

- **PostgreSQL Adapter** (`@db-bridge/postgresql`)
  - Full PostgreSQL 15+ support
  - Connection pooling with pg
  - JSONB and array type support
  - Advanced transaction isolation levels
  - LISTEN/NOTIFY support
  - COPY operations

- **Redis Adapter** (`@db-bridge/redis`)
  - Full Redis 7+ support
  - All data types (strings, lists, sets, hashes, sorted sets)
  - Pub/Sub messaging
  - Pipeline and transactions
  - Cache integration for query results
  - Tag-based cache invalidation

### Security

- Input validation for all query parameters
- SQL injection prevention through parameterized queries
- Secure connection options (SSL/TLS)
- Field-level encryption support

## [Unreleased]

### Planned

- SQLite adapter
- MongoDB adapter
- Query result streaming
- Automatic query optimization hints
- Schema migration tools
- Database seeding utilities
