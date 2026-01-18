import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSQLAdapter } from '@db-bridge/postgresql';
import { ConnectionConfig } from '@db-bridge/core';

describe('PostgreSQL Integration Tests', () => {
  let adapter: PostgreSQLAdapter;
  let isConnected = false;

  const testConfig: ConnectionConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'test',
    database: process.env.POSTGRES_DATABASE || 'test_db',
    connectionLimit: 5,
  };

  beforeAll(async () => {
    adapter = new PostgreSQLAdapter();

    try {
      await adapter.connect(testConfig);
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS integration_test_users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE,
          age INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      isConnected = true;
    } catch (error) {
      console.warn('PostgreSQL integration test setup failed:', error);
      console.warn('Skipping PostgreSQL integration tests. Make sure PostgreSQL is running.');
    }
  });

  afterAll(async () => {
    if (isConnected) {
      try {
        await adapter.execute('DROP TABLE IF EXISTS integration_test_users');
        await adapter.disconnect();
      } catch (error) {
        console.warn('PostgreSQL cleanup failed:', error);
      }
    }
  });

  it('should connect to PostgreSQL database', async () => {
    if (!isConnected) return;

    expect(adapter).toBeDefined();

    // Test basic query
    const result = await adapter.query('SELECT 1 as test');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual({ test: 1 });
  });

  it('should perform CRUD operations', async () => {
    if (!isConnected) return;

    // Insert
    const insertResult = await adapter.execute(
      'INSERT INTO integration_test_users (name, email, age) VALUES ($1, $2, $3) RETURNING id',
      ['John Doe', 'john@example.com', 30],
    );
    expect(insertResult.rows).toHaveLength(1);
    expect(insertResult.affectedRows).toBe(1);

    const userId = insertResult.rows[0].id;

    // Select
    const selectResult = await adapter.query('SELECT * FROM integration_test_users WHERE id = $1', [
      userId,
    ]);
    expect(selectResult.rows).toHaveLength(1);
    expect(selectResult.rows[0].name).toBe('John Doe');
    expect(selectResult.rows[0].email).toBe('john@example.com');
    expect(selectResult.rows[0].age).toBe(30);

    // Update
    await adapter.execute('UPDATE integration_test_users SET age = $1 WHERE id = $2', [31, userId]);

    const updatedResult = await adapter.query(
      'SELECT age FROM integration_test_users WHERE id = $1',
      [userId],
    );
    expect(updatedResult.rows[0].age).toBe(31);

    // Delete
    const deleteResult = await adapter.execute('DELETE FROM integration_test_users WHERE id = $1', [
      userId,
    ]);
    expect(deleteResult.affectedRows).toBe(1);

    // Verify deletion
    const verifyResult = await adapter.query('SELECT * FROM integration_test_users WHERE id = $1', [
      userId,
    ]);
    expect(verifyResult.rows).toHaveLength(0);
  });

  it('should handle transactions', async () => {
    if (!isConnected) return;

    const transaction = await adapter.beginTransaction();

    try {
      // Insert data in transaction
      const insertResult = await transaction.execute(
        'INSERT INTO integration_test_users (name, email, age) VALUES ($1, $2, $3) RETURNING id',
        ['Transaction User', 'trans@example.com', 25],
      );

      const userId = insertResult.rows[0].id;

      const selectResult = await transaction.query(
        'SELECT * FROM integration_test_users WHERE id = $1',
        [userId],
      );
      expect(selectResult.rows).toHaveLength(1);

      // Rollback transaction
      await transaction.rollback();

      // Verify data was rolled back
      const verifyResult = await adapter.query(
        'SELECT * FROM integration_test_users WHERE email = $1',
        ['trans@example.com'],
      );
      expect(verifyResult.rows).toHaveLength(0);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  });

  it('should handle prepared statements', async () => {
    if (!isConnected) return;

    const stmt = await adapter.prepare(
      'INSERT INTO integration_test_users (name, email, age) VALUES ($1, $2, $3) RETURNING id',
    );

    try {
      const result1 = await stmt.execute(['User 1', 'user1@test.com', 20]);
      const result2 = await stmt.execute(['User 2', 'user2@test.com', 22]);

      expect(result1.affectedRows).toBe(1);
      expect(result2.affectedRows).toBe(1);
      expect(result1.rows).toHaveLength(1);
      expect(result2.rows).toHaveLength(1);

      // Verify data
      const selectResult = await adapter.query(
        'SELECT COUNT(*) as count FROM integration_test_users WHERE email LIKE $1',
        ['%@test.com'],
      );
      expect(parseInt(selectResult.rows[0].count)).toBe(2);

      // Clean up
      await adapter.execute('DELETE FROM integration_test_users WHERE email LIKE $1', [
        '%@test.com',
      ]);
    } finally {
      await stmt.close();
    }
  });

  it('should handle batch operations', async () => {
    if (!isConnected) return;

    const users = [
      ['Batch User 1', 'batch1@test.com', 25],
      ['Batch User 2', 'batch2@test.com', 26],
      ['Batch User 3', 'batch3@test.com', 27],
    ];

    const results = await adapter.executeBatch(
      'INSERT INTO integration_test_users (name, email, age) VALUES ($1, $2, $3)',
      users,
    );

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.affectedRows).toBe(1);
    });

    // Verify batch insert
    const selectResult = await adapter.query(
      'SELECT COUNT(*) as count FROM integration_test_users WHERE email LIKE $1',
      ['batch%@test.com'],
    );
    expect(parseInt(selectResult.rows[0].count)).toBe(3);

    // Clean up
    await adapter.execute('DELETE FROM integration_test_users WHERE email LIKE $1', [
      'batch%@test.com',
    ]);
  });

  it('should handle advanced PostgreSQL features', async () => {
    if (!isConnected) return;

    // Test JSON operations
    await adapter.execute(`
      CREATE TEMPORARY TABLE json_test (
        id SERIAL PRIMARY KEY,
        data JSONB
      )
    `);

    await adapter.execute('INSERT INTO json_test (data) VALUES ($1)', [
      JSON.stringify({ name: 'Test', tags: ['tag1', 'tag2'] }),
    ]);

    const jsonResult = await adapter.query(
      "SELECT data->>'name' as name, data->'tags' as tags FROM json_test",
    );

    expect(jsonResult.rows).toHaveLength(1);
    expect(jsonResult.rows[0].name).toBe('Test');

    // Test array operations
    const arrayResult = await adapter.query('SELECT ARRAY[1,2,3] as numbers');
    expect(arrayResult.rows[0].numbers).toEqual([1, 2, 3]);
  });
});
