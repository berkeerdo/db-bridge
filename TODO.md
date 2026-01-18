# db-bridge Migration System - Implementation Plan

## Overview

Industry-grade migration system combining the best of Prisma, Drizzle, and Knex.

## Core Features

### 1. Migration Tracking (Database Tables)

Like Knex, migrations are tracked in database tables:

```sql
-- Main migrations table
CREATE TABLE db_migrations (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,           -- '20250118120000_create_users'
  batch INT NOT NULL,                    -- Batch number for rollback grouping
  executed_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64) NOT NULL,         -- SHA256 of migration content
  execution_time_ms INT NOT NULL
);

-- Migration lock table (prevent concurrent migrations)
CREATE TABLE db_migrations_lock (
  id INT PRIMARY KEY,
  is_locked TINYINT NOT NULL DEFAULT 0,
  locked_at TIMESTAMP NULL,
  locked_by VARCHAR(255) NULL           -- hostname/process id
);
```

### 2. Migration File Structure

```
src/
└── migrations/
    ├── 20250118120000_create_users_table.ts
    ├── 20250118120001_add_email_index.ts
    └── 20250118120002_create_posts_table.ts
```

Each migration file:

```typescript
import { Migration } from '@db-bridge/core';

export default {
  name: 'create_users_table',

  async up(schema) {
    await schema.createTable('users', (table) => {
      table.increments('id').primary();
      table.string('email', 255).unique().notNull();
      table.string('password', 255).notNull();
      table.enum('role', ['admin', 'user']).default('user');
      table.timestamps(); // created_at, updated_at
    });
  },

  async down(schema) {
    await schema.dropTableIfExists('users');
  },
} satisfies Migration;
```

### 3. Schema Builder API

Fluent API for table operations:

```typescript
// Table Creation
schema.createTable('users', (table) => {
  // Column Types
  table.increments('id'); // AUTO_INCREMENT PRIMARY KEY
  table.bigIncrements('id'); // BIGINT AUTO_INCREMENT
  table.string('name', 100); // VARCHAR(100)
  table.text('bio'); // TEXT
  table.integer('age'); // INT
  table.bigInteger('views'); // BIGINT
  table.float('price'); // FLOAT
  table.decimal('amount', 10, 2); // DECIMAL(10,2)
  table.boolean('active'); // TINYINT(1) / BOOLEAN
  table.date('birth_date'); // DATE
  table.datetime('published_at'); // DATETIME
  table.timestamp('created_at'); // TIMESTAMP
  table.time('start_time'); // TIME
  table.json('metadata'); // JSON
  table.uuid('public_id'); // CHAR(36) / UUID
  table.binary('data'); // BLOB / BYTEA
  table.enum('status', ['a', 'b']); // ENUM

  // Modifiers
  table.string('email').notNull().unique();
  table.integer('count').default(0);
  table.string('nullable_field').nullable();
  table.integer('user_id').unsigned();
  table.string('col').after('other_col'); // MySQL only
  table.string('col').first(); // MySQL only
  table.string('col').comment('Description');

  // Indexes
  table.index('email');
  table.index(['first_name', 'last_name'], 'idx_full_name');
  table.unique('email');
  table.primary('id');
  table.fulltext('content'); // MySQL only

  // Foreign Keys
  table.integer('user_id').unsigned();
  table.foreign('user_id').references('id').on('users').onDelete('CASCADE').onUpdate('CASCADE');

  // Shortcuts
  table.timestamps(); // created_at, updated_at
  table.softDeletes(); // deleted_at
  table.foreignId('user_id'); // user_id + foreign key
});

// Table Modification
schema.alterTable('users', (table) => {
  table.addColumn('phone', 'string', 20);
  table.dropColumn('old_field');
  table.renameColumn('name', 'full_name');
  table.modifyColumn('email', 'string', 500);
  table.addIndex('phone');
  table.dropIndex('idx_old');
  table.addForeign('team_id').references('id').on('teams');
  table.dropForeign('fk_old');
});

// Other Operations
schema.dropTable('users');
schema.dropTableIfExists('users');
schema.renameTable('users', 'members');
schema.hasTable('users'); // Returns boolean
schema.hasColumn('users', 'email'); // Returns boolean
```

### 4. Dialect Support

SQL generation per database:

```typescript
// MySQL
CREATE TABLE `users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

// PostgreSQL
CREATE TABLE "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR(255) NOT NULL UNIQUE
);
```

### 5. CLI Commands

```bash
# Generate new migration
npx db-bridge migrate:make create_users_table
# Output: Created migration: src/migrations/20250118120000_create_users_table.ts

# Run all pending migrations
npx db-bridge migrate:latest
# Output:
# Batch 1: 3 migrations
#   ✓ 20250118120000_create_users_table (45ms)
#   ✓ 20250118120001_add_email_index (12ms)
#   ✓ 20250118120002_create_posts_table (38ms)

# Rollback last batch
npx db-bridge migrate:rollback
# Output:
# Rolling back batch 1...
#   ✓ 20250118120002_create_posts_table (rolled back)

# Rollback specific number of batches
npx db-bridge migrate:rollback --step=2

# Rollback all
npx db-bridge migrate:reset

# Fresh start (drop all + migrate)
npx db-bridge migrate:fresh

# Check status
npx db-bridge migrate:status
# Output:
# ┌─────────────────────────────────────────┬───────┬─────────────────────┐
# │ Migration                               │ Batch │ Executed At         │
# ├─────────────────────────────────────────┼───────┼─────────────────────┤
# │ 20250118120000_create_users_table       │ 1     │ 2025-01-18 12:00:00 │
# │ 20250118120001_add_email_index          │ 1     │ 2025-01-18 12:00:01 │
# │ 20250118120002_create_posts_table       │ Pending                     │
# └─────────────────────────────────────────┴───────┴─────────────────────┘

# Validate migrations
npx db-bridge migrate:validate
```

### 6. Configuration

```typescript
// db-bridge.config.ts
import { defineConfig } from '@db-bridge/core';

export default defineConfig({
  // Database connection
  connection: {
    dialect: 'mysql', // 'mysql' | 'postgresql'
    host: process.env.DB_HOST,
    port: 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },

  // Migration settings
  migrations: {
    directory: './src/migrations',
    tableName: 'db_migrations',
    lockTableName: 'db_migrations_lock',
  },

  // Seeds (optional)
  seeds: {
    directory: './src/seeds',
  },
});
```

### 7. Programmatic API

```typescript
import { MigrationRunner } from '@db-bridge/core';
import { MySQLAdapter } from '@db-bridge/mysql';

const adapter = new MySQLAdapter(config);
await adapter.connect();

const runner = new MigrationRunner(adapter, {
  directory: './src/migrations',
  tableName: 'db_migrations',
});

// Run migrations
await runner.latest();

// Rollback
await runner.rollback();

// Status
const status = await runner.status();
console.log(status.pending); // Pending migrations
console.log(status.executed); // Executed migrations
```

### 8. Advanced Features

#### Zero-Downtime (Expand/Contract)

```typescript
export default {
  name: 'rename_email_to_user_email',
  phase: 'expand', // 'expand' | 'migrate' | 'contract'

  async up(schema) {
    // Phase 1: Add new column
    await schema.alterTable('users', (t) => {
      t.addColumn('user_email', 'string', 255);
    });

    // Copy data
    await schema.raw(`
      UPDATE users SET user_email = email WHERE user_email IS NULL
    `);
  },

  async down(schema) {
    await schema.alterTable('users', (t) => {
      t.dropColumn('user_email');
    });
  },
};
```

#### Transaction Support

```typescript
export default {
  name: 'complex_migration',
  transactional: true, // Default: true

  async up(schema) {
    // All operations in a transaction
    // Automatically rolled back on error
  },
};
```

#### Concurrent Index Creation (PostgreSQL)

```typescript
export default {
  name: 'add_large_index',
  transactional: false, // Required for CONCURRENTLY

  async up(schema) {
    await schema.raw(`
      CREATE INDEX CONCURRENTLY idx_users_email ON users(email)
    `);
  },
};
```

---

## Implementation Checklist

### Phase 1: Core Schema Builder ✅

- [x] `ColumnBuilder` class - column definitions with modifiers
- [x] `TableBuilder` class - table operations
- [x] `SchemaBuilder` class - main API
- [x] MySQL dialect SQL generation
- [x] PostgreSQL dialect SQL generation
- [x] Unit tests for schema builder

### Phase 2: Migration Runner Enhancement ✅

- [x] Update `MigrationRunner` for file-based loading
- [x] `MigrationLoader` - load migrations from directory
- [x] Batch tracking support
- [x] Migration lock mechanism
- [x] Transaction support per migration
- [x] Unit tests for runner

### Phase 3: CLI ✅

- [x] CLI entry point (`bin/db-bridge`)
- [x] `migrate:make` command
- [x] `migrate:latest` command
- [x] `migrate:rollback` command
- [x] `migrate:status` command
- [x] `migrate:reset` command
- [x] `migrate:fresh` command
- [x] `migrate:validate` command
- [x] Config file loading (`db-bridge.config.ts`)

### Phase 4: Advanced Features ✅

- [x] Expand/Contract pattern support (ExpandContractHelper)
- [x] Checksum validation
- [x] Dry-run mode
- [x] Migration templates
- [x] Seed support (make:seeder, db:seed)

### Phase 5: Documentation & Testing

- [ ] Integration tests with real databases
- [x] Type definitions
- [x] CLI help documentation

---

## File Structure (Implemented)

```
packages/core/src/
├── schema/
│   ├── index.ts
│   ├── types.ts
│   ├── SchemaBuilder.ts
│   ├── TableBuilder.ts
│   ├── ColumnBuilder.ts
│   ├── ForeignKeyBuilder.ts
│   └── dialects/
│       ├── index.ts
│       ├── MySQLDialect.ts
│       └── PostgreSQLDialect.ts
├── migrations/
│   ├── index.ts
│   ├── types.ts
│   ├── migration-runner.ts       # Legacy runner
│   ├── FileMigrationRunner.ts    # Enhanced file-based runner
│   ├── MigrationLoader.ts        # Load migrations from directory
│   ├── MigrationLock.ts          # Concurrent migration prevention
│   └── ExpandContract.ts         # Zero-downtime helpers
├── seeds/
│   ├── index.ts
│   ├── types.ts
│   ├── SeederLoader.ts
│   └── SeederRunner.ts
└── cli/
    ├── index.ts                  # CLI entry point
    ├── config.ts                 # Config loading (defineConfig)
    ├── utils.ts                  # Helper utilities
    └── commands/
        ├── index.ts
        ├── make.ts               # migrate:make
        ├── latest.ts             # migrate:latest
        ├── rollback.ts           # migrate:rollback
        ├── status.ts             # migrate:status
        ├── reset.ts              # migrate:reset
        ├── fresh.ts              # migrate:fresh
        ├── validate.ts           # migrate:validate
        ├── seed.ts               # db:seed
        └── make-seeder.ts        # make:seeder
```

---

## References

- [Knex Migrations](https://knexjs.org/guide/migrations.html)
- [Prisma Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Drizzle Kit](https://orm.drizzle.team/docs/kit-overview)
- [Expand/Contract Pattern](https://www.prisma.io/docs/guides/data-migration)
