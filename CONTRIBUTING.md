# Contributing to DB Bridge

Thank you for your interest in contributing to DB Bridge! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Guidelines](#development-guidelines)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Documentation](#documentation)
- [Release Process](#release-process)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please:

- Be respectful and constructive in all interactions
- Welcome newcomers and help them get started
- Focus on what is best for the community and project
- Show empathy towards other community members

## How to Contribute

### Reporting Bugs

1. Check if the issue already exists in GitHub Issues
2. Create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce the problem
   - Expected vs actual behavior
   - Environment details (Node.js version, OS, database versions)
   - Code samples or test cases if applicable

### Suggesting Enhancements

1. Check existing issues and discussions
2. Create a new issue with:
   - Clear description of the enhancement
   - Use cases and benefits
   - Potential implementation approach
   - Breaking change considerations

### Contributing Code

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Write/update tests
5. Update documentation
6. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 16+ and npm 8+
- Git
- Docker (for running test databases)
- TypeScript knowledge
- Basic understanding of SQL databases

### Local Databases

```bash
# MySQL
docker run -d \
  --name mysql-test \
  -e MYSQL_ROOT_PASSWORD=password \
  -e MYSQL_DATABASE=db_bridge_test \
  -p 3306:3306 \
  mysql:8

# PostgreSQL
docker run -d \
  --name postgres-test \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=db_bridge_test \
  -p 5432:5432 \
  postgres:15

# Redis
docker run -d \
  --name redis-test \
  -p 6379:6379 \
  redis:7
```

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/berkeerdo/db-bridge.git
cd db-bridge

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run specific package tests
npm run test:mysql
npm run test:postgresql
npm run test:redis
```

## Project Structure

```
db-bridge/
├── packages/
│   ├── core/           # Base interfaces and abstract implementations
│   ├── mysql/          # MySQL adapter
│   ├── postgresql/     # PostgreSQL adapter
│   └── redis/          # Redis adapter and caching
├── examples/           # Usage examples
├── scripts/           # Build and utility scripts
├── docs/             # Additional documentation
└── tests/            # Integration tests
```

## Development Guidelines

### TypeScript

- Enable strict mode in all packages
- Avoid `any` types - use `unknown` or generics
- Provide comprehensive type definitions
- Export all public types

### Error Handling

- Use custom error classes from @db-bridge/core
- Provide meaningful error messages
- Include relevant context (SQL, parameters, etc.)
- Handle edge cases gracefully

### Code Organization

```typescript
// 1. Imports (grouped and ordered)
import { BaseAdapter } from '@db-bridge/core';
import type { QueryResult } from '@db-bridge/core';

// 2. Constants
const DEFAULT_PORT = 5432;

// 3. Interfaces/Types
interface Config {
  // ...
}

// 4. Main class/function
export class PostgreSQLAdapter extends BaseAdapter {
  // ...
}

// 5. Helper functions
function parseResult(result: any): QueryResult {
  // ...
}
```

### Async/Await

Always use async/await instead of callbacks:

```typescript
// ✅ Good
async function query(sql: string): Promise<QueryResult> {
  try {
    const result = await this.connection.query(sql);
    return parseResult(result);
  } catch (error) {
    throw new QueryError('Query failed', { cause: error });
  }
}

// ❌ Bad
function query(sql: string, callback: (err: Error, result?: QueryResult) => void) {
  this.connection.query(sql, (err, result) => {
    if (err) callback(err);
    else callback(null, parseResult(result));
  });
}
```

## Testing

### Unit Tests

Each package has its own test suite:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific package tests
cd packages/mysql
npm test

# Run in watch mode
npm test -- --watch
```

### Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;

  beforeEach(async () => {
    adapter = new MySQLAdapter();
    await adapter.connect(testConfig);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  describe('query', () => {
    it('should execute simple SELECT query', async () => {
      const result = await adapter.query('SELECT 1 as num');
      expect(result.rows[0].num).toBe(1);
    });

    it('should handle parameterized queries', async () => {
      const result = await adapter.query('SELECT * FROM users WHERE id = ?', [123]);
      expect(result.rows).toHaveLength(1);
    });
  });
});
```

### Integration Tests

```bash
# Run integration tests
npm run test:integration

# Run specific database tests
npm run test:integration:mysql
npm run test:integration:postgresql
npm run test:integration:redis
```

## Pull Request Process

### Before Submitting

1. **Test your changes**:

   ```bash
   npm test
   npm run lint
   npm run build
   ```

2. **Update documentation**:
   - Add JSDoc comments for public APIs
   - Update README if adding features
   - Add examples for new functionality

3. **Follow commit conventions**:
   ```
   feat: add support for connection pooling
   fix: handle connection timeout correctly
   docs: update query builder examples
   test: add tests for transaction rollback
   refactor: simplify error handling logic
   chore: update dependencies
   ```

### PR Guidelines

1. **Title**: Clear, concise description
2. **Description**:
   - What changes were made
   - Why they were necessary
   - Breaking changes
   - Related issues
3. **Size**: Keep PRs focused and reasonably sized
4. **Tests**: All new features must have tests
5. **Documentation**: Update relevant docs

### Review Process

1. Automated checks must pass:
   - CI/CD pipeline
   - Test coverage
   - Linting
   - Type checking

2. Code review focusing on:
   - Code quality and maintainability
   - Performance implications
   - Security considerations
   - API consistency
   - Test coverage

## Coding Standards

### Naming Conventions

```typescript
// Classes: PascalCase
class DatabaseAdapter {}

// Interfaces: PascalCase with 'I' prefix optional
interface QueryBuilder {}

// Functions/Methods: camelCase
function executeQuery() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Private members: prefix with underscore
private _connection: Connection;
```

### File Organization

```
adapter-name/
├── src/
│   ├── index.ts          # Public exports
│   ├── adapter.ts        # Main adapter class
│   ├── query-builder.ts  # Query builder implementation
│   ├── errors.ts         # Custom errors
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Helper functions
├── tests/
│   ├── adapter.test.ts
│   ├── query-builder.test.ts
│   └── fixtures/         # Test data
└── package.json
```

### Comments and Documentation

```typescript
/**
 * Executes a SQL query with optional parameters
 *
 * @param sql - The SQL query string
 * @param params - Optional query parameters
 * @param options - Query execution options
 * @returns Query result with rows and metadata
 * @throws {QueryError} If query execution fails
 *
 * @example
 * const result = await adapter.query(
 *   'SELECT * FROM users WHERE role = ?',
 *   ['admin']
 * );
 */
async query<T = unknown>(
  sql: string,
  params?: unknown[],
  options?: QueryOptions
): Promise<QueryResult<T>> {
  // Implementation
}
```

## Documentation

### Where to Document

1. **Code**: JSDoc comments for all public APIs
2. **README**: Package-specific documentation
3. **Examples**: Working code examples
4. **API Docs**: Generated from JSDoc
5. **Guides**: Complex features or patterns

### Documentation Standards

- Write for developers who are new to the project
- Include code examples for all features
- Explain the "why" not just the "what"
- Keep examples realistic and runnable
- Update docs with code changes

## Release Process

### Version Management

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking API changes
- **MINOR**: New features (backwards compatible)
- **PATCH**: Bug fixes and minor improvements

### Release Steps

1. **Prepare Release**:

   ```bash
   # Update versions
   npm run version -- --bump minor

   # Update changelogs
   npm run changelog

   # Build and test
   npm run build
   npm test
   ```

2. **Create Release PR**:
   - Title: `Release v{version}`
   - Include changelog
   - List breaking changes

3. **After Merge**:

   ```bash
   # Tag release
   git tag v{version}
   git push origin v{version}

   # Publish to npm
   npm run publish
   ```

### Changelog Format

```markdown
## [1.2.0] - 2025-01-15

### Added

- Connection pooling support for MySQL adapter
- Query timeout options

### Fixed

- Memory leak in prepared statements
- Transaction rollback error handling

### Changed

- Improved error messages for connection failures
- Updated minimum Node.js version to 16

### Breaking Changes

- Renamed `executeSQL` to `execute` for consistency
```

## Questions?

If you have questions or need help:

1. Check existing documentation
2. Search GitHub issues
3. Ask in discussions
4. Create a new issue

Thank you for contributing to DB Bridge! 🌉
