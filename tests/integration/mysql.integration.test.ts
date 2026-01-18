import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MySQLAdapter } from '@db-bridge/mysql';
import { ConnectionConfig } from '@db-bridge/core';

describe('MySQL Integration Tests', () => {
  let adapter: MySQLAdapter;
  let isConnected = false;

  const testConfig: ConnectionConfig = {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'test',
    database: process.env.MYSQL_DATABASE || 'test_db',
    connectionLimit: 5,
  };

  beforeAll(async () => {
    adapter = new MySQLAdapter();

    try {
      await adapter.connect(testConfig);
      await adapter.execute(`
        CREATE TABLE IF NOT EXISTS integration_test_users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE,
          age INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      isConnected = true;
    } catch (error) {
      console.warn('MySQL integration test setup failed:', error);
      console.warn('Skipping MySQL integration tests. Make sure MySQL is running.');
    }
  });

  afterAll(async () => {
    if (isConnected) {
      try {
        await adapter.execute('DROP TABLE IF EXISTS integration_test_users');
        await adapter.disconnect();
      } catch (error) {
        console.warn('MySQL cleanup failed:', error);
      }
    }
  });

  it('should connect to MySQL database', async () => {
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
      'INSERT INTO integration_test_users (name, email, age) VALUES (?, ?, ?)',
      ['John Doe', 'john@example.com', 30],
    );
    expect(insertResult.affectedRows).toBe(1);
    expect(insertResult.insertId).toBeGreaterThan(0);

    const userId = insertResult.insertId;

    // Select
    const selectResult = await adapter.query('SELECT * FROM integration_test_users WHERE id = ?', [
      userId,
    ]);
    expect(selectResult.rows).toHaveLength(1);
    expect(selectResult.rows[0].name).toBe('John Doe');
    expect(selectResult.rows[0].email).toBe('john@example.com');
    expect(selectResult.rows[0].age).toBe(30);

    // Update
    await adapter.execute('UPDATE integration_test_users SET age = ? WHERE id = ?', [31, userId]);

    const updatedResult = await adapter.query(
      'SELECT age FROM integration_test_users WHERE id = ?',
      [userId],
    );
    expect(updatedResult.rows[0].age).toBe(31);

    // Delete
    const deleteResult = await adapter.execute('DELETE FROM integration_test_users WHERE id = ?', [
      userId,
    ]);
    expect(deleteResult.affectedRows).toBe(1);

    // Verify deletion
    const verifyResult = await adapter.query('SELECT * FROM integration_test_users WHERE id = ?', [
      userId,
    ]);
    expect(verifyResult.rows).toHaveLength(0);
  });

  it('should handle transactions', async () => {
    if (!isConnected) return;

    const transaction = await adapter.beginTransaction();

    try {
      // Insert data in transaction
      await transaction.execute(
        'INSERT INTO integration_test_users (name, email, age) VALUES (?, ?, ?)',
        ['Transaction User', 'trans@example.com', 25],
      );

      const selectResult = await transaction.query(
        'SELECT * FROM integration_test_users WHERE email = ?',
        ['trans@example.com'],
      );
      expect(selectResult.rows).toHaveLength(1);

      // Rollback transaction
      await transaction.rollback();

      // Verify data was rolled back
      const verifyResult = await adapter.query(
        'SELECT * FROM integration_test_users WHERE email = ?',
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
      'INSERT INTO integration_test_users (name, email, age) VALUES (?, ?, ?)',
    );

    try {
      const result1 = await stmt.execute(['User 1', 'user1@test.com', 20]);
      const result2 = await stmt.execute(['User 2', 'user2@test.com', 22]);

      expect(result1.affectedRows).toBe(1);
      expect(result2.affectedRows).toBe(1);

      // Verify data
      const selectResult = await adapter.query(
        'SELECT COUNT(*) as count FROM integration_test_users WHERE email LIKE ?',
        ['%@test.com'],
      );
      expect(selectResult.rows[0].count).toBe(2);

      // Clean up
      await adapter.execute('DELETE FROM integration_test_users WHERE email LIKE ?', [
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
      'INSERT INTO integration_test_users (name, email, age) VALUES (?, ?, ?)',
      users,
    );

    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.affectedRows).toBe(1);
    });

    // Verify batch insert
    const selectResult = await adapter.query(
      'SELECT COUNT(*) as count FROM integration_test_users WHERE email LIKE ?',
      ['batch%@test.com'],
    );
    expect(selectResult.rows[0].count).toBe(3);

    // Clean up
    await adapter.execute('DELETE FROM integration_test_users WHERE email LIKE ?', [
      'batch%@test.com',
    ]);
  });
});
