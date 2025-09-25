# Integration Tests

This directory contains integration tests for DB Bridge that test the actual database connections and cross-adapter functionality.

## Prerequisites

Before running integration tests, ensure you have the following services running:

### MySQL
```bash
# Using Docker
docker run -d \
  --name db-bridge-mysql \
  -e MYSQL_ROOT_PASSWORD=test \
  -e MYSQL_DATABASE=test_db \
  -p 3306:3306 \
  mysql:8.0

# Or using Docker Compose
docker-compose -f docker-compose.test.yml up -d mysql
```

### PostgreSQL
```bash
# Using Docker
docker run -d \
  --name db-bridge-postgres \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=test_db \
  -p 5432:5432 \
  postgres:15

# Or using Docker Compose
docker-compose -f docker-compose.test.yml up -d postgres
```

### Redis
```bash
# Using Docker
docker run -d \
  --name db-bridge-redis \
  -p 6379:6379 \
  redis:7-alpine

# Or using Docker Compose
docker-compose -f docker-compose.test.yml up -d redis
```

## Environment Configuration

Set the following environment variables to customize database connections:

```bash
# MySQL
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_USER=root
export MYSQL_PASSWORD=test
export MYSQL_DATABASE=test_db

# PostgreSQL
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=test
export POSTGRES_DATABASE=test_db

# Redis
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_PASSWORD=
export REDIS_DATABASE=0
```

## Running Tests

### All Integration Tests
```bash
# From root directory
npm run test:integration

# Or directly with vitest
cd tests/integration
npx vitest run
```

### Individual Test Files
```bash
cd tests/integration

# MySQL tests
npx vitest run mysql-integration.test.ts

# PostgreSQL tests
npx vitest run postgresql-integration.test.ts

# Redis tests
npx vitest run redis-integration.test.ts

# Cross-adapter tests
npx vitest run cross-adapter-integration.test.ts
```

### With Coverage
```bash
cd tests/integration
npx vitest run --coverage
```

## Test Files

### mysql-integration.test.ts
Tests MySQL adapter functionality:
- Basic CRUD operations
- Transactions
- Prepared statements
- Batch operations
- Connection handling

### postgresql-integration.test.ts
Tests PostgreSQL adapter functionality:
- Basic CRUD operations
- Transactions
- Prepared statements
- Batch operations
- PostgreSQL-specific features (JSON, arrays)

### redis-integration.test.ts
Tests Redis adapter functionality:
- String operations
- Hash operations
- List operations
- Set operations
- Sorted set operations
- Bulk operations
- Counter operations
- Expiration and TTL
- Scanning operations

### cross-adapter-integration.test.ts
Tests cross-adapter patterns:
- Caching patterns with SQL + Redis
- Data synchronization between SQL databases
- Session management
- Event-driven data flow
- Distributed locking

## Docker Compose for Testing

Create a `docker-compose.test.yml` file in the root directory:

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: test
      MYSQL_DATABASE: test_db
    ports:
      - "3306:3306"
    command: --default-authentication-plugin=mysql_native_password
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test_db
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
```

## Troubleshooting

### Connection Issues
- Ensure all database services are running
- Check port availability
- Verify credentials and permissions
- Check firewall settings

### Test Failures
- Tests automatically skip if database connections fail
- Check logs for specific error messages
- Ensure test databases are empty before running tests
- Verify environment variables are set correctly

### Performance Issues
- Integration tests run with 30-second timeouts
- Disable file parallelism to avoid connection conflicts
- Clean up test data to improve performance

## CI/CD Integration

For CI/CD pipelines, use the provided Docker Compose file:

```bash
# Start services
docker-compose -f docker-compose.test.yml up -d

# Wait for services to be healthy
docker-compose -f docker-compose.test.yml ps

# Run integration tests
npm run test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down -v
```