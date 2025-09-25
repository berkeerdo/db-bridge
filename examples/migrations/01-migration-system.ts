/**
 * Database Migration System
 * 
 * A complete migration system for managing database schema changes
 * with version control and rollback support.
 */

import { DBBridge } from '@db-bridge/core';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Migration {
  id: number;
  name: string;
  up: string | ((db: DBBridge) => Promise<void>);
  down: string | ((db: DBBridge) => Promise<void>);
}

class MigrationSystem {
  private db: DBBridge;
  private migrationsPath: string;

  constructor(db: DBBridge, migrationsPath: string = './migrations') {
    this.db = db;
    this.migrationsPath = migrationsPath;
  }

  async initialize() {
    // Create migrations table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version BIGINT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INT,
        checksum VARCHAR(64)
      )
    `);

    // Create migrations history table
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS migration_history (
        id INT PRIMARY KEY AUTO_INCREMENT,
        version BIGINT NOT NULL,
        direction VARCHAR(10) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INT,
        error TEXT NULL,
        INDEX idx_version (version)
      )
    `);

    console.log('✅ Migration system initialized');
  }

  async status() {
    const executed = await this.db.query<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations ORDER BY version'
    );

    const pending = await this.getPendingMigrations();

    console.log('\n=== Migration Status ===');
    console.log(`Executed: ${executed.rows.length}`);
    console.log(`Pending: ${pending.length}`);

    if (executed.rows.length > 0) {
      console.log('\nExecuted migrations:');
      executed.rows.forEach(m => {
        console.log(`  ✅ ${m.version}: ${m.name}`);
      });
    }

    if (pending.length > 0) {
      console.log('\nPending migrations:');
      pending.forEach(m => {
        console.log(`  ⏳ ${m.id}: ${m.name}`);
      });
    }

    return { executed: executed.rows, pending };
  }

  async migrate(target?: number) {
    const pending = await this.getPendingMigrations();

    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`\n=== Running ${pending.length} migrations ===`);

    for (const migration of pending) {
      if (target && migration.id > target) {
        break;
      }

      await this.runMigration(migration, 'up');
    }

    console.log('\n✅ All migrations completed');
  }

  async rollback(steps: number = 1) {
    const executed = await this.db.query<{ version: number; name: string }>(
      'SELECT version, name FROM schema_migrations ORDER BY version DESC LIMIT ?',
      [steps]
    );

    if (executed.rows.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    console.log(`\n=== Rolling back ${executed.rows.length} migrations ===`);

    for (const migration of executed.rows) {
      const migrationDef = await this.loadMigration(migration.version);
      if (migrationDef) {
        await this.runMigration(migrationDef, 'down');
      }
    }

    console.log('\n✅ Rollback completed');
  }

  private async runMigration(migration: Migration, direction: 'up' | 'down') {
    const startTime = Date.now();
    console.log(`\nRunning ${direction}: ${migration.id} - ${migration.name}`);

    try {
      await this.db.transaction(async (trx) => {
        // Execute migration
        const sql = migration[direction];
        if (typeof sql === 'string') {
          // SQL string
          const statements = sql.split(';').filter(s => s.trim());
          for (const statement of statements) {
            await trx.execute(statement);
          }
        } else {
          // Function
          await sql(this.db);
        }

        // Update migrations table
        if (direction === 'up') {
          await trx.execute(
            'INSERT INTO schema_migrations (version, name, execution_time_ms) VALUES (?, ?, ?)',
            [migration.id, migration.name, Date.now() - startTime]
          );
        } else {
          await trx.execute(
            'DELETE FROM schema_migrations WHERE version = ?',
            [migration.id]
          );
        }

        // Log to history
        await trx.execute(
          'INSERT INTO migration_history (version, direction, execution_time_ms) VALUES (?, ?, ?)',
          [migration.id, direction, Date.now() - startTime]
        );
      });

      console.log(`✅ Completed in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error(`❌ Failed: ${error.message}`);
      
      // Log error to history
      await this.db.execute(
        'INSERT INTO migration_history (version, direction, execution_time_ms, error) VALUES (?, ?, ?, ?)',
        [migration.id, direction, Date.now() - startTime, error.message]
      );

      throw error;
    }
  }

  private async getPendingMigrations(): Promise<Migration[]> {
    const executed = await this.db.query<{ version: number }>(
      'SELECT version FROM schema_migrations'
    );
    const executedVersions = new Set(executed.rows.map(r => r.version));

    const allMigrations = await this.loadAllMigrations();
    return allMigrations.filter(m => !executedVersions.has(m.id));
  }

  private async loadAllMigrations(): Promise<Migration[]> {
    // This is a simplified version. In production, you'd load from files
    return migrations.sort((a, b) => a.id - b.id);
  }

  private async loadMigration(version: number): Promise<Migration | null> {
    return migrations.find(m => m.id === version) || null;
  }

  async reset() {
    console.log('\n=== Resetting database ===');
    
    // Get all tables
    const tables = await this.db.query<{ table_name: string }>(
      `SELECT table_name 
       FROM information_schema.tables 
       WHERE table_schema = DATABASE() 
       AND table_type = 'BASE TABLE'`
    );

    // Drop all tables
    await this.db.execute('SET FOREIGN_KEY_CHECKS = 0');
    
    for (const table of tables.rows) {
      await this.db.execute(`DROP TABLE IF EXISTS ${table.table_name}`);
      console.log(`Dropped table: ${table.table_name}`);
    }
    
    await this.db.execute('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ Database reset complete');
  }

  async seed() {
    console.log('\n=== Seeding database ===');
    await seedDatabase(this.db);
    console.log('✅ Database seeded');
  }
}

// Example migrations
const migrations: Migration[] = [
  {
    id: 20240101000001,
    name: 'create_users_table',
    up: `
      CREATE TABLE users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_role (role)
      )
    `,
    down: 'DROP TABLE IF EXISTS users'
  },
  {
    id: 20240102000001,
    name: 'create_posts_table',
    up: `
      CREATE TABLE posts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        content TEXT,
        status VARCHAR(20) DEFAULT 'draft',
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_slug (slug),
        INDEX idx_status (status),
        INDEX idx_published (published_at),
        FULLTEXT(title, content)
      )
    `,
    down: 'DROP TABLE IF EXISTS posts'
  },
  {
    id: 20240103000001,
    name: 'create_comments_table',
    up: `
      CREATE TABLE comments (
        id INT PRIMARY KEY AUTO_INCREMENT,
        post_id INT NOT NULL,
        user_id INT NOT NULL,
        parent_id INT NULL,
        content TEXT NOT NULL,
        likes INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE,
        INDEX idx_post (post_id),
        INDEX idx_user (user_id),
        INDEX idx_parent (parent_id)
      )
    `,
    down: 'DROP TABLE IF EXISTS comments'
  },
  {
    id: 20240104000001,
    name: 'add_user_profile_fields',
    up: async (db: DBBridge) => {
      // Add columns
      await db.execute('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500) AFTER name');
      await db.execute('ALTER TABLE users ADD COLUMN bio TEXT AFTER avatar_url');
      await db.execute('ALTER TABLE users ADD COLUMN website VARCHAR(255) AFTER bio');
      await db.execute('ALTER TABLE users ADD COLUMN location VARCHAR(100) AFTER website');
      
      // Create profile settings table
      await db.execute(`
        CREATE TABLE user_settings (
          user_id INT PRIMARY KEY,
          theme VARCHAR(20) DEFAULT 'light',
          language VARCHAR(5) DEFAULT 'en',
          timezone VARCHAR(50) DEFAULT 'UTC',
          email_notifications BOOLEAN DEFAULT true,
          push_notifications BOOLEAN DEFAULT true,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
    },
    down: async (db: DBBridge) => {
      await db.execute('ALTER TABLE users DROP COLUMN avatar_url');
      await db.execute('ALTER TABLE users DROP COLUMN bio');
      await db.execute('ALTER TABLE users DROP COLUMN website');
      await db.execute('ALTER TABLE users DROP COLUMN location');
      await db.execute('DROP TABLE IF EXISTS user_settings');
    }
  },
  {
    id: 20240105000001,
    name: 'create_tags_system',
    up: `
      CREATE TABLE tags (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(50) UNIQUE NOT NULL,
        slug VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        post_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_slug (slug)
      );

      CREATE TABLE post_tags (
        post_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (post_id, tag_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      );
    `,
    down: `
      DROP TABLE IF EXISTS post_tags;
      DROP TABLE IF EXISTS tags;
    `
  }
];

// Seed data
async function seedDatabase(db: DBBridge) {
  // Create users
  const users = [
    { email: 'admin@example.com', password: 'hashed_admin', name: 'Admin User', role: 'admin' },
    { email: 'john@example.com', password: 'hashed_john', name: 'John Doe', role: 'user' },
    { email: 'jane@example.com', password: 'hashed_jane', name: 'Jane Smith', role: 'user' },
  ];

  for (const user of users) {
    await db.table('users').insert(user);
  }

  // Create posts
  const posts = [
    {
      user_id: 1,
      title: 'Welcome to Our Blog',
      slug: 'welcome-to-our-blog',
      content: 'This is the first post on our new blog platform...',
      status: 'published',
      published_at: new Date()
    },
    {
      user_id: 2,
      title: 'Getting Started with DB Bridge',
      slug: 'getting-started-with-db-bridge',
      content: 'DB Bridge is a powerful database abstraction layer...',
      status: 'published',
      published_at: new Date()
    }
  ];

  for (const post of posts) {
    await db.table('posts').insert(post);
  }

  // Create tags
  const tags = [
    { name: 'Technology', slug: 'technology' },
    { name: 'Tutorial', slug: 'tutorial' },
    { name: 'Database', slug: 'database' },
  ];

  for (const tag of tags) {
    await db.table('tags').insert(tag);
  }

  // Assign tags to posts
  await db.table('post_tags').insert([
    { post_id: 1, tag_id: 1 },
    { post_id: 2, tag_id: 1 },
    { post_id: 2, tag_id: 2 },
    { post_id: 2, tag_id: 3 },
  ]);

  console.log('✅ Seed data inserted');
}

// CLI Interface
async function main() {
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'migration_test'
  });

  try {
    await db.connect();
    console.log('✅ Connected to database\n');

    const migrator = new MigrationSystem(db);
    await migrator.initialize();

    const command = process.argv[2];

    switch (command) {
      case 'status':
        await migrator.status();
        break;

      case 'migrate':
        await migrator.migrate();
        break;

      case 'rollback':
        const steps = parseInt(process.argv[3]) || 1;
        await migrator.rollback(steps);
        break;

      case 'reset':
        await migrator.reset();
        break;

      case 'fresh':
        await migrator.reset();
        await migrator.migrate();
        await migrator.seed();
        break;

      case 'seed':
        await migrator.seed();
        break;

      default:
        console.log('Usage: ts-node migration.ts [command]');
        console.log('\nCommands:');
        console.log('  status    - Show migration status');
        console.log('  migrate   - Run pending migrations');
        console.log('  rollback  - Rollback migrations (default: 1)');
        console.log('  reset     - Reset database');
        console.log('  fresh     - Reset, migrate and seed');
        console.log('  seed      - Seed the database');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await db.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { MigrationSystem, Migration };