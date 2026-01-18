# db-bridge

<div align="center">

[![npm version](https://img.shields.io/npm/v/@db-bridge/core.svg)](https://www.npmjs.com/package/@db-bridge/core)
[![npm downloads](https://img.shields.io/npm/dm/@db-bridge/core.svg)](https://www.npmjs.com/package/@db-bridge/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

**Unified database interface for Node.js with MySQL, PostgreSQL, Redis support and powerful migration system.**

[Getting Started](#quick-start) •
[Documentation](./docs) •
[Migration CLI](#migration-cli) •
[Contributing](./CONTRIBUTING.md)

</div>

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Query Builder](#query-builder)
- [Migration CLI](#migration-cli)
- [Transactions](#transactions)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Packages](#packages)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Unified API** - Same interface for MySQL, PostgreSQL, and Redis
- **Query Builder** - Chainable, type-safe query construction
- **Migration System** - Industry-grade CLI with batch tracking, rollback, checksums
- **Schema Builder** - Fluent API for table creation and modification
- **Transactions** - Full transaction support with savepoints
- **Connection Pooling** - Built-in connection pool management
- **Seeding** - Database seeding support for test data
- **TypeScript** - Full type safety with generics support
- **ESM** - Native ES modules support
- **Modular** - Install only the adapters you need

## Installation

```bash
# All-in-one (includes all adapters)
npm install db-bridge

# Or install only what you need
npm install @db-bridge/core          # Core + CLI
npm install @db-bridge/mysql         # MySQL/MariaDB
npm install @db-bridge/postgresql    # PostgreSQL
npm install @db-bridge/redis         # Redis (cache adapter)
```

## Quick Start

### Connection

```typescript
import { DBBridge } from '@db-bridge/core';

const db = DBBridge.mysql({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'myapp',
});

await db.connect();
```

### Basic Queries

```typescript
// SELECT with conditions
const users = await db
  .table('users')
  .select('id', 'name', 'email')
  .where('status', 'active')
  .orderBy('name', 'asc')
  .limit(50)
  .get();

// INSERT
await db.table('users').insert({
  name: 'John Doe',
  email: 'john@example.com',
});

// UPDATE
await db.table('users').where('id', 1).update({ status: 'inactive' });

// DELETE
await db.table('sessions').where('expires_at', '<', new Date()).delete();
```

## Query Builder

Full-featured query builder with joins, aggregates, and more:

```typescript
// JOIN
const orders = await db
  .table('orders')
  .join('users', 'orders.user_id = users.id')
  .select('orders.*', 'users.name as customer')
  .where('orders.status', 'pending')
  .get();

// Complex conditions
const users = await db
  .table('users')
  .whereIn('role', ['admin', 'editor'])
  .whereBetween('age', [18, 65])
  .whereNotNull('email_verified_at')
  .get();

// Aggregates
const count = await db.table('users').where('active', true).count();
const total = await db.table('orders').sum('amount');
```

> **[View full Query Builder documentation →](./docs/guides/query-builder.md)**

## Migration CLI

Industry-grade migration system inspired by Laravel, Knex, and Prisma.

### Setup

Create `db-bridge.config.mjs` in your project root:

```javascript
export default {
  connection: {
    dialect: 'mysql', // or 'postgresql'
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'secret',
    database: 'myapp',
  },
  migrations: {
    directory: './src/migrations',
  },
  seeds: {
    directory: './src/seeds',
  },
};
```

### Commands

```bash
# Create a new migration
npx db-bridge migrate:make create_users_table

# Run pending migrations
npx db-bridge migrate:latest

# Check migration status
npx db-bridge migrate:status

# Rollback last batch
npx db-bridge migrate:rollback

# Rollback multiple batches
npx db-bridge migrate:rollback --step=3

# Reset all migrations
npx db-bridge migrate:reset

# Fresh start (reset + migrate)
npx db-bridge migrate:fresh

# Validate migration checksums
npx db-bridge migrate:validate

# Create a seeder
npx db-bridge make:seeder users

# Run seeders
npx db-bridge db:seed
```

### Migration Example

```typescript
// src/migrations/20260118120000_create_users_table.ts
import type { SchemaBuilder } from '@db-bridge/core';

export default {
  name: '20260118120000_create_users_table',

  async up(schema: SchemaBuilder): Promise<void> {
    await schema.createTable('users', (table) => {
      table.increments('id');
      table.string('name', 100).notNull();
      table.string('email', 255).unique().notNull();
      table.string('password', 255).notNull();
      table.boolean('active').default(true);
      table.timestamps();
    });
  },

  async down(schema: SchemaBuilder): Promise<void> {
    await schema.dropTableIfExists('users');
  },
};
```

### Schema Builder API

```typescript
schema.createTable('posts', (table) => {
  table.increments('id'); // INT AUTO_INCREMENT PRIMARY KEY
  table.bigIncrements('id'); // BIGINT AUTO_INCREMENT
  table.string('title', 255); // VARCHAR(255)
  table.text('content'); // TEXT
  table.integer('views'); // INT
  table.boolean('published'); // TINYINT(1)
  table.timestamp('published_at'); // TIMESTAMP
  table.json('metadata'); // JSON
  table.timestamps(); // created_at, updated_at

  // Foreign keys
  table.integer('user_id').unsigned();
  table.foreign('user_id').references('id').on('users').onDelete('CASCADE');

  // Indexes
  table.index('title');
  table.unique('slug');
});
```

> **[View full Migration documentation →](./docs/migration.md)**

## Transactions

```typescript
await db.transaction(async (trx) => {
  const orderId = await trx.table('orders').insert({
    user_id: 1,
    total: 99.99,
  });

  await trx.table('order_items').insert([
    { order_id: orderId, product_id: 1, quantity: 2 },
    { order_id: orderId, product_id: 3, quantity: 1 },
  ]);

  await trx.table('inventory').where('product_id', 1).decrement('quantity', 2);
});
```

## Configuration

### MySQL

| Option            | Type   | Default      | Description          |
| ----------------- | ------ | ------------ | -------------------- |
| `host`            | string | localhost    | Database host        |
| `port`            | number | 3306         | Database port        |
| `user`            | string | root         | Username             |
| `password`        | string | -            | Password             |
| `database`        | string | **required** | Database name        |
| `connectionLimit` | number | 10           | Max pool connections |

### PostgreSQL

| Option     | Type   | Default      | Description          |
| ---------- | ------ | ------------ | -------------------- |
| `host`     | string | localhost    | Database host        |
| `port`     | number | 5432         | Database port        |
| `user`     | string | postgres     | Username             |
| `password` | string | -            | Password             |
| `database` | string | **required** | Database name        |
| `max`      | number | 10           | Max pool connections |

### Redis

| Option      | Type   | Default   | Description                   |
| ----------- | ------ | --------- | ----------------------------- |
| `host`      | string | localhost | Redis host                    |
| `port`      | number | 6379      | Redis port                    |
| `password`  | string | -         | Password                      |
| `db`        | number | 0         | Database index                |
| `keyPrefix` | string | -         | Key prefix for all operations |

## Documentation

| Guide                                           | Description                 |
| ----------------------------------------------- | --------------------------- |
| [Getting Started](./docs/getting-started.md)    | Quick start guide           |
| [Query Builder](./docs/guides/query-builder.md) | Full query builder API      |
| [Migrations](./docs/migration.md)               | Migration system guide      |
| [Architecture](./docs/architecture.md)          | System architecture         |
| [API Reference](./docs/api.md)                  | Complete API reference      |
| [Caching](./docs/caching.md)                    | Redis caching guide         |
| [Encryption](./docs/encryption.md)              | Field-level encryption      |
| [Troubleshooting](./docs/troubleshooting.md)    | Common issues and solutions |

## Packages

| Package                 | Description                         |
| ----------------------- | ----------------------------------- |
| `db-bridge`             | All-in-one package                  |
| `@db-bridge/core`       | Core interfaces, CLI, and utilities |
| `@db-bridge/mysql`      | MySQL/MariaDB adapter               |
| `@db-bridge/postgresql` | PostgreSQL adapter                  |
| `@db-bridge/redis`      | Redis cache adapter                 |

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

```bash
# Clone the repository
git clone https://github.com/berkeerdo/db-bridge.git

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.3.0 (for TypeScript users)

## License

MIT © [berkeerdo](https://github.com/berkeerdo)

---

<div align="center">

**[⬆ back to top](#db-bridge)**

Made with ❤️ by [Berke Erdoğan](https://github.com/berkeerdo)

</div>
