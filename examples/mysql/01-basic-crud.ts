/**
 * MySQL Basic CRUD Operations
 * 
 * This example demonstrates all basic CRUD operations
 * with MySQL using DB Bridge.
 */

import { DBBridge } from '@db-bridge/core';

async function main() {
  // Initialize MySQL connection
  const db = DBBridge.mysql({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'test_db',
    pool: {
      min: 2,
      max: 10
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected to MySQL\n');

    // CREATE - Insert operations
    console.log('=== CREATE Operations ===');
    
    // Single insert
    const userId = await db.table('users').insert({
      name: 'John Doe',
      email: 'john@example.com',
      age: 30,
      active: true,
      created_at: new Date()
    });
    console.log('Inserted user with ID:', userId);

    // Bulk insert
    const productIds = await db.table('products').insert([
      { name: 'Laptop', price: 999.99, category: 'Electronics' },
      { name: 'Mouse', price: 29.99, category: 'Electronics' },
      { name: 'Keyboard', price: 79.99, category: 'Electronics' }
    ]);
    console.log('Inserted products:', productIds);

    // Insert with raw SQL
    const result = await db.execute(
      'INSERT INTO logs (action, user_id, created_at) VALUES (?, ?, NOW())',
      ['user_login', userId]
    );
    console.log('Insert result:', result);

    // READ - Select operations
    console.log('\n=== READ Operations ===');
    
    // Select all
    const allUsers = await db.table('users').get();
    console.log('All users count:', allUsers.length);

    // Select with conditions
    const activeUsers = await db.table('users')
      .where('active', true)
      .where('age', '>=', 18)
      .orderBy('created_at', 'desc')
      .limit(10)
      .get();
    console.log('Active adult users:', activeUsers.length);

    // Select specific columns
    const userEmails = await db.table('users')
      .select('id', 'name', 'email')
      .where('active', true)
      .get();
    console.log('User emails:', userEmails);

    // Select with JOIN
    const ordersWithUsers = await db.query(`
      SELECT 
        o.id as order_id,
        o.total,
        o.status,
        u.name as customer_name,
        u.email as customer_email
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
      LIMIT 10
    `, ['pending']);
    console.log('Pending orders:', ordersWithUsers.rows);

    // Aggregate functions
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        AVG(age) as average_age,
        MIN(age) as min_age,
        MAX(age) as max_age
      FROM users
      WHERE active = true
    `);
    console.log('User statistics:', stats.rows[0]);

    // Group by example
    const usersByCountry = await db.query(`
      SELECT 
        country,
        COUNT(*) as user_count,
        AVG(age) as avg_age
      FROM users
      GROUP BY country
      HAVING COUNT(*) > 5
      ORDER BY user_count DESC
    `);
    console.log('Users by country:', usersByCountry.rows);

    // UPDATE - Update operations
    console.log('\n=== UPDATE Operations ===');
    
    // Update with conditions
    const updatedCount = await db.table('users')
      .where('id', userId)
      .update({
        name: 'John Smith',
        updated_at: new Date()
      });
    console.log('Updated rows:', updatedCount);

    // Update multiple rows
    const deactivated = await db.table('users')
      .where('last_login', '<', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) // 90 days ago
      .update({ active: false });
    console.log('Deactivated inactive users:', deactivated);

    // Update with raw SQL
    await db.execute(`
      UPDATE products 
      SET 
        price = price * 0.9,
        on_sale = true
      WHERE 
        category = ? 
        AND stock > ?
    `, ['Electronics', 10]);

    // Increment/Decrement
    await db.execute(
      'UPDATE products SET view_count = view_count + 1 WHERE id = ?',
      [productIds[0]]
    );

    // DELETE - Delete operations
    console.log('\n=== DELETE Operations ===');
    
    // Delete single record
    const deleted = await db.table('logs')
      .where('created_at', '<', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .delete();
    console.log('Deleted old logs:', deleted);

    // Delete with multiple conditions
    await db.table('sessions')
      .where('expired', true)
      .orWhere('last_activity', '<', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .delete();

    // Delete with raw SQL
    await db.execute(
      'DELETE FROM temp_data WHERE created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)',
      [24]
    );

    // ADVANCED QUERIES
    console.log('\n=== Advanced Queries ===');

    // Subqueries
    const highValueUsers = await db.query(`
      SELECT * FROM users
      WHERE id IN (
        SELECT DISTINCT user_id 
        FROM orders 
        WHERE total > 1000
      )
    `);
    console.log('High value users:', highValueUsers.rows.length);

    // EXISTS clause
    const usersWithOrders = await db.query(`
      SELECT u.* FROM users u
      WHERE EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = u.id
        AND o.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      )
    `);
    console.log('Users with recent orders:', usersWithOrders.rows.length);

    // Complex JOIN with multiple tables
    const orderDetails = await db.query(`
      SELECT 
        o.id as order_id,
        u.name as customer,
        p.name as product,
        oi.quantity,
        oi.price,
        (oi.quantity * oi.price) as line_total
      FROM orders o
      INNER JOIN users u ON o.user_id = u.id
      INNER JOIN order_items oi ON oi.order_id = o.id
      INNER JOIN products p ON oi.product_id = p.id
      WHERE o.status = 'completed'
      ORDER BY o.created_at DESC
      LIMIT 20
    `);
    console.log('Order details:', orderDetails.rows);

    // Window functions (MySQL 8.0+)
    const rankedProducts = await db.query(`
      SELECT 
        name,
        category,
        price,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) as price_rank,
        RANK() OVER (ORDER BY sales_count DESC) as sales_rank
      FROM products
      WHERE active = true
    `);
    console.log('Ranked products:', rankedProducts.rows);

    // Common Table Expressions (CTEs)
    const monthlyStats = await db.query(`
      WITH monthly_sales AS (
        SELECT 
          DATE_FORMAT(created_at, '%Y-%m') as month,
          SUM(total) as revenue,
          COUNT(*) as order_count
        FROM orders
        WHERE status = 'completed'
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      )
      SELECT 
        month,
        revenue,
        order_count,
        revenue / order_count as avg_order_value
      FROM monthly_sales
      ORDER BY month DESC
      LIMIT 12
    `);
    console.log('Monthly stats:', monthlyStats.rows);

    // UPSERT operation (INSERT ... ON DUPLICATE KEY UPDATE)
    await db.execute(`
      INSERT INTO user_settings (user_id, theme, language, notifications)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        theme = VALUES(theme),
        language = VALUES(language),
        notifications = VALUES(notifications),
        updated_at = NOW()
    `, [userId, 'dark', 'en', true]);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('\n✅ Disconnected from MySQL');
  }
}

// Helper function to create tables
async function createTables(db: DBBridge) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      age INT,
      country VARCHAR(2),
      active BOOLEAN DEFAULT true,
      last_login TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active (active),
      INDEX idx_country (country),
      INDEX idx_created (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(200) NOT NULL,
      category VARCHAR(50),
      price DECIMAL(10, 2),
      stock INT DEFAULT 0,
      active BOOLEAN DEFAULT true,
      on_sale BOOLEAN DEFAULT false,
      view_count INT DEFAULT 0,
      sales_count INT DEFAULT 0,
      INDEX idx_category (category),
      INDEX idx_price (price)
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INT PRIMARY KEY AUTO_INCREMENT,
      user_id INT NOT NULL,
      total DECIMAL(10, 2),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      INDEX idx_user (user_id),
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INT PRIMARY KEY AUTO_INCREMENT,
      order_id INT NOT NULL,
      product_id INT NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10, 2) NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id),
      INDEX idx_order (order_id)
    )`,
    `CREATE TABLE IF NOT EXISTS logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      action VARCHAR(50),
      user_id INT,
      details JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created (created_at)
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id INT,
      data JSON,
      expired BOOLEAN DEFAULT false,
      last_activity TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS user_settings (
      user_id INT PRIMARY KEY,
      theme VARCHAR(20),
      language VARCHAR(5),
      notifications BOOLEAN,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )`
  ];

  for (const sql of tables) {
    await db.execute(sql);
  }
  console.log('✅ Tables created');
}

// Run the example
main().catch(console.error);