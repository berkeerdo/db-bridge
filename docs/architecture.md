# DB Bridge Architecture Guide

## Overview

DB Bridge follows Clean Architecture principles to provide a maintainable, testable, and extensible database abstraction layer. The architecture separates concerns into distinct layers, each with specific responsibilities.

## Architecture Principles

### 1. Clean Architecture

The codebase is organized into three main layers:

```
┌─────────────────────────────────────┐
│          Domain Layer               │  ← Business Logic & Interfaces
├─────────────────────────────────────┤
│        Application Layer            │  ← Use Cases & Orchestration  
├─────────────────────────────────────┤
│       Infrastructure Layer          │  ← External Dependencies
└─────────────────────────────────────┘
```

### 2. Dependency Rule

Dependencies flow inward - outer layers depend on inner layers, never the reverse:

- **Domain Layer**: No dependencies on other layers
- **Application Layer**: Depends only on Domain layer
- **Infrastructure Layer**: Depends on Domain and Application layers

### 3. SOLID Principles

#### Single Responsibility Principle (SRP)
Each class has one reason to change:
- `ConnectionManager`: Only handles connections
- `QueryExecutor`: Only executes queries
- `EventBus`: Only manages events

#### Open/Closed Principle (OCP)
Classes are open for extension but closed for modification:
- New database adapters extend base classes
- New features added via composition

#### Liskov Substitution Principle (LSP)
All adapters are interchangeable through common interfaces:
```typescript
function runQuery(adapter: DatabaseAdapter) {
  // Works with any adapter implementation
  return adapter.query('SELECT * FROM users');
}
```

#### Interface Segregation Principle (ISP)
Interfaces are focused and cohesive:
```typescript
interface IConnectionManager { /* connection methods */ }
interface IQueryExecutor { /* query methods */ }
interface IEventBus { /* event methods */ }
```

#### Dependency Inversion Principle (DIP)
Depend on abstractions, not concretions:
```typescript
class MySQLAdapter {
  constructor(
    private connectionManager: IConnectionManager,
    private queryExecutor: IQueryExecutor
  ) {}
}
```

## Layer Architecture

### Domain Layer (`/domain`)

The core business logic and rules. This layer contains:

#### Entities (`/domain/entities`)
Core business objects that encapsulate enterprise-wide business rules.

```typescript
interface IEntity {
  id: string | number;
  createdAt?: Date;
  updatedAt?: Date;
}
```

#### Services (`/domain/services`)
Domain services that encapsulate business logic that doesn't naturally fit within entities.

- `IConnectionManager`: Connection lifecycle management
- `IQueryExecutor`: Query execution abstraction  
- `IEventBus`: Event notification system

#### Repositories (`/domain/repositories`)
Interfaces for data access abstractions.

```typescript
interface IRepository<T> {
  findById(id: string | number): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: string | number): Promise<boolean>;
}
```

### Application Layer (`/application`)

Application-specific business rules and use cases.

#### Use Cases (`/application/use-cases`)
Application-specific business rules that orchestrate the flow of data.

```typescript
class CreateUserUseCase {
  constructor(
    private userRepository: IUserRepository,
    private eventBus: IEventBus
  ) {}

  async execute(data: CreateUserDTO): Promise<User> {
    const user = await this.userRepository.create(data);
    await this.eventBus.emit('user.created', user);
    return user;
  }
}
```

#### Services (`/application/services`)
Application services that coordinate between different domain services.

- `IDatabaseService`: High-level database operations
- `ICacheService`: Caching orchestration

#### Factories (`/application/factories`)
Factory interfaces for creating complex objects.

- `IAdapterFactory`: Creates database adapters
- `IDatabaseServiceFactory`: Creates configured services

### Infrastructure Layer (`/infrastructure`)

External dependencies and framework-specific code.

#### Persistence (`/infrastructure/persistence`)
Database-specific implementations:

- `ComposableAdapter`: Base adapter using composition
- `BaseRepository`: Generic repository implementation

#### Events (`/infrastructure/events`)
Event handling implementations:

- `EventBus`: Node.js EventEmitter-based implementation

#### Caching (`/infrastructure/caching`)
Cache implementations:

- `RedisCache`: Redis-based caching
- `MemoryCache`: In-memory caching

## Design Patterns

### 1. Repository Pattern

Abstracts data access logic:

```typescript
class UserRepository extends BaseRepository<User> {
  constructor(adapter: DatabaseAdapter) {
    super(adapter, 'users');
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email } });
  }
}
```

### 2. Factory Pattern

Creates complex objects:

```typescript
class DatabaseAdapterFactory {
  create(type: DatabaseType): DatabaseAdapter {
    switch (type) {
      case 'mysql':
        return new MySQLAdapter();
      case 'postgresql':
        return new PostgreSQLAdapter();
    }
  }
}
```

### 3. Strategy Pattern

Different algorithms for same operation:

```typescript
interface ICacheStrategy {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

class LRUCacheStrategy implements ICacheStrategy { }
class TTLCacheStrategy implements ICacheStrategy { }
```

### 4. Observer Pattern

Event-driven architecture:

```typescript
eventBus.on('query:executed', (event) => {
  logger.info('Query executed', event);
  metrics.recordQuery(event);
});
```

### 5. Adapter Pattern

Adapts different database engines to common interface:

```typescript
class MySQLAdapter implements DatabaseAdapter {
  async query(sql: string): Promise<QueryResult> {
    // MySQL-specific implementation
  }
}
```

### 6. Unit of Work Pattern

Manages transactions as a unit:

```typescript
class UnitOfWork {
  private transaction: Transaction;
  
  async complete(): Promise<void> {
    await this.transaction.commit();
  }
  
  async rollback(): Promise<void> {
    await this.transaction.rollback();
  }
}
```

## Package Structure

### Core Package

```
packages/core/src/
├── domain/                  # Domain layer
│   ├── entities/           # Business entities
│   ├── services/           # Domain service interfaces
│   └── repositories/       # Repository interfaces
├── application/            # Application layer
│   ├── use-cases/         # Application use cases
│   ├── services/          # Application services
│   └── factories/         # Factory interfaces
└── infrastructure/        # Infrastructure layer
    ├── persistence/       # Database implementations
    ├── events/           # Event implementations
    └── caching/          # Cache implementations
```

### Database Adapter Packages

Each adapter follows the same structure:

```
packages/[mysql|postgresql]/src/
├── domain/                # Database-specific domain
│   └── services/         # Database-specific services
├── application/          # Database-specific application
│   └── factories/        # Adapter factories
└── infrastructure/       # Database-specific infrastructure
    ├── connection/       # Connection management
    ├── query/           # Query execution
    └── types/           # Type handling
```

## Dependency Injection

The architecture uses constructor injection for dependencies:

```typescript
class MySQLAdapter extends ComposableAdapter {
  constructor(
    connectionManager: IConnectionManager,
    queryExecutor: IQueryExecutor,
    eventBus: IEventBus
  ) {
    super(connectionManager, queryExecutor, eventBus);
  }
}
```

## Testing Strategy

### Unit Tests

Test individual components in isolation:

```typescript
describe('MySQLQueryExecutor', () => {
  let executor: MySQLQueryExecutor;
  let mockConnectionManager: jest.Mocked<IConnectionManager>;

  beforeEach(() => {
    mockConnectionManager = createMockConnectionManager();
    executor = new MySQLQueryExecutor(mockConnectionManager);
  });

  it('should execute query', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Test component interactions:

```typescript
describe('MySQL Integration', () => {
  let adapter: MySQLAdapter;

  beforeAll(async () => {
    adapter = MySQLAdapterFactory.create();
    await adapter.connect(testConfig);
  });

  it('should perform CRUD operations', async () => {
    // Test implementation
  });
});
```

## Migration Path

### From Monolithic BaseAdapter

1. **Extract Interfaces**: Define clear interfaces for each responsibility
2. **Implement Services**: Create focused service implementations
3. **Refactor Adapter**: Use composition instead of inheritance
4. **Update Tests**: Test services independently
5. **Gradual Migration**: Support both old and new adapters

### Adding New Database Support

1. **Implement Connection Manager**: Database-specific connection handling
2. **Implement Query Executor**: Database-specific query execution
3. **Create Adapter**: Compose services into adapter
4. **Add Type Support**: Handle database-specific types
5. **Write Tests**: Comprehensive test coverage

## Performance Considerations

### Connection Pooling

Each adapter maintains a connection pool:

```typescript
interface PoolConfig {
  min: number;          // Minimum connections
  max: number;          // Maximum connections
  idle: number;         // Idle timeout
  acquire: number;      // Acquire timeout
}
```

### Query Optimization

- Prepared statements for repeated queries
- Query result caching
- Batch operations support

### Event System

- Asynchronous event handling
- Event batching for high throughput
- Configurable event buffer size

## Security

### SQL Injection Prevention

- Parameterized queries by default
- Input validation and escaping
- Identifier escaping for dynamic queries

### Connection Security

- SSL/TLS support
- Connection string sanitization
- Credential management best practices

## Future Enhancements

### Planned Features

1. **Query Analyzer**: Analyze and optimize queries
2. **Migration System**: Database schema migrations
3. **Monitoring**: Built-in performance monitoring
4. **Multi-tenancy**: Database-per-tenant support
5. **Sharding**: Horizontal scaling support

### Extension Points

The architecture provides clear extension points:

- Custom adapters via `IAdapterFactory`
- Custom repositories via `BaseRepository`
- Custom caching strategies
- Event middleware system

## Best Practices

### 1. Use Dependency Injection

Always inject dependencies rather than creating them:

```typescript
// ✅ Good
constructor(private repository: IUserRepository) {}

// ❌ Bad  
constructor() {
  this.repository = new UserRepository();
}
```

### 2. Program to Interfaces

Depend on interfaces, not implementations:

```typescript
// ✅ Good
function processQuery(executor: IQueryExecutor) { }

// ❌ Bad
function processQuery(executor: MySQLQueryExecutor) { }
```

### 3. Keep Layers Separate

Don't mix concerns across layers:

```typescript
// ✅ Good - Repository in infrastructure layer
class MySQLUserRepository implements IUserRepository { }

// ❌ Bad - SQL in domain layer
class User {
  save() { 
    db.query('INSERT INTO users...'); 
  }
}
```

### 4. Use Factories for Complex Creation

Use factories when object creation is complex:

```typescript
const adapter = AdapterFactory.createWithRetry({
  type: 'mysql',
  retryOptions: { maxRetries: 3 }
});
```

## Conclusion

This architecture provides:

- **Maintainability**: Clear separation of concerns
- **Testability**: Easy to test in isolation
- **Extensibility**: Easy to add new features
- **Flexibility**: Easy to swap implementations
- **Scalability**: Performance-optimized design

By following these principles and patterns, DB Bridge provides a robust foundation for database access in Node.js applications.