/**
 * MySQL Advanced Query Examples
 * 
 * This example demonstrates advanced MySQL features including:
 * - JSON operations
 * - Full-text search
 * - Spatial queries
 * - Stored procedures
 * - Views and indexes
 */

import { DBBridge } from '@db-bridge/core';

async function main() {
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'advanced_db',
    pool: {
      min: 5,
      max: 20
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected to MySQL\n');

    // Setup tables
    await setupTables(db);

    // JSON Operations (MySQL 5.7+)
    await jsonOperations(db);

    // Full-Text Search
    await fullTextSearch(db);

    // Spatial Queries
    await spatialQueries(db);

    // Advanced Indexing
    await advancedIndexing(db);

    // Stored Procedures
    await storedProcedures(db);

    // Views
    await viewsExample(db);

    // Triggers
    await triggersExample(db);

    // Performance optimization
    await performanceOptimization(db);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('\n✅ Disconnected');
  }
}

async function setupTables(db: DBBridge) {
  console.log('=== Setting up tables ===');

  // Table with JSON column
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(200) NOT NULL,
      details JSON,
      tags JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FULLTEXT(name)
    )
  `);

  // Table with spatial data
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stores (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100),
      location POINT NOT NULL,
      delivery_area POLYGON,
      SPATIAL INDEX(location)
    )
  `);

  // Table for text search
  await db.execute(`
    CREATE TABLE IF NOT EXISTS articles (
      id INT PRIMARY KEY AUTO_INCREMENT,
      title VARCHAR(200),
      content TEXT,
      tags VARCHAR(500),
      published_at TIMESTAMP,
      FULLTEXT(title, content)
    )
  `);

  console.log('✅ Tables created\n');
}

async function jsonOperations(db: DBBridge) {
  console.log('=== JSON Operations ===');

  // Insert JSON data
  await db.execute(`
    INSERT INTO products (name, details, tags) VALUES
    (?, ?, ?),
    (?, ?, ?)
  `, [
    'Laptop Pro',
    JSON.stringify({
      brand: 'TechCorp',
      specs: {
        cpu: 'Intel i7',
        ram: '16GB',
        storage: '512GB SSD'
      },
      price: 1299.99
    }),
    JSON.stringify(['electronics', 'computers', 'premium']),
    'Gaming Mouse',
    JSON.stringify({
      brand: 'GameGear',
      specs: {
        dpi: 16000,
        buttons: 7,
        wireless: true
      },
      price: 79.99
    }),
    JSON.stringify(['electronics', 'gaming', 'accessories'])
  ]);

  // Query JSON fields
  const techProducts = await db.query(`
    SELECT 
      name,
      JSON_EXTRACT(details, '$.brand') as brand,
      JSON_EXTRACT(details, '$.price') as price,
      JSON_EXTRACT(details, '$.specs.cpu') as cpu
    FROM products
    WHERE JSON_EXTRACT(details, '$.brand') = 'TechCorp'
  `);
  console.log('TechCorp products:', techProducts.rows);

  // JSON array operations
  const gamingProducts = await db.query(`
    SELECT name, tags
    FROM products
    WHERE JSON_CONTAINS(tags, '"gaming"')
  `);
  console.log('Gaming products:', gamingProducts.rows);

  // Update JSON fields
  await db.execute(`
    UPDATE products
    SET details = JSON_SET(
      details,
      '$.price', JSON_EXTRACT(details, '$.price') * 0.9,
      '$.discount', true,
      '$.specs.warranty', '2 years'
    )
    WHERE JSON_EXTRACT(details, '$.price') > 100
  `);

  // JSON aggregation
  const priceStats = await db.query(`
    SELECT 
      JSON_EXTRACT(details, '$.brand') as brand,
      COUNT(*) as product_count,
      AVG(JSON_EXTRACT(details, '$.price')) as avg_price,
      JSON_ARRAYAGG(name) as products
    FROM products
    GROUP BY JSON_EXTRACT(details, '$.brand')
  `);
  console.log('Price stats by brand:', priceStats.rows);

  // Complex JSON queries
  const complexQuery = await db.query(`
    SELECT 
      name,
      JSON_UNQUOTE(JSON_EXTRACT(details, '$.brand')) as brand,
      JSON_LENGTH(tags) as tag_count,
      JSON_PRETTY(details) as formatted_details
    FROM products
    WHERE JSON_EXTRACT(details, '$.specs.wireless') = true
       OR JSON_SEARCH(tags, 'one', 'premium') IS NOT NULL
  `);
  console.log('Complex query results:', complexQuery.rows);
}

async function fullTextSearch(db: DBBridge) {
  console.log('\n=== Full-Text Search ===');

  // Insert sample articles
  await db.execute(`
    INSERT INTO articles (title, content, tags, published_at) VALUES
    (?, ?, ?, NOW()),
    (?, ?, ?, NOW()),
    (?, ?, ?, NOW())
  `, [
    'Introduction to Machine Learning',
    'Machine learning is a subset of artificial intelligence that enables computers to learn from data...',
    'ai,ml,technology,tutorial',
    'Deep Learning Neural Networks',
    'Deep learning uses neural networks with multiple layers to progressively extract features...',
    'ai,deep-learning,neural-networks',
    'Natural Language Processing Basics',
    'NLP is a field of AI that helps computers understand and interpret human language...',
    'ai,nlp,language,processing'
  ]);

  // Natural language search
  const mlArticles = await db.query(`
    SELECT 
      id,
      title,
      MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
    FROM articles
    WHERE MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)
    ORDER BY relevance DESC
  `, ['machine learning', 'machine learning']);
  console.log('ML articles:', mlArticles.rows);

  // Boolean mode search
  const advancedSearch = await db.query(`
    SELECT title
    FROM articles
    WHERE MATCH(title, content) AGAINST(? IN BOOLEAN MODE)
  `, ['+neural +networks -basic']);
  console.log('Advanced search:', advancedSearch.rows);

  // Query expansion
  const expandedSearch = await db.query(`
    SELECT title
    FROM articles
    WHERE MATCH(title, content) AGAINST(? WITH QUERY EXPANSION)
    LIMIT 5
  `, ['AI']);
  console.log('Expanded search results:', expandedSearch.rows);
}

async function spatialQueries(db: DBBridge) {
  console.log('\n=== Spatial Queries ===');

  // Insert stores with locations
  await db.execute(`
    INSERT INTO stores (name, location) VALUES
    ('Downtown Store', ST_GeomFromText('POINT(40.7128 -74.0060)')),
    ('Uptown Store', ST_GeomFromText('POINT(40.7580 -73.9855)')),
    ('Brooklyn Store', ST_GeomFromText('POINT(40.6782 -73.9442)'))
  `);

  // Find nearest stores
  const userLocation = 'POINT(40.7260 -73.9897)';
  const nearestStores = await db.query(`
    SELECT 
      name,
      ST_Distance_Sphere(location, ST_GeomFromText(?)) as distance_meters
    FROM stores
    ORDER BY distance_meters
    LIMIT 3
  `, [userLocation]);
  console.log('Nearest stores:', nearestStores.rows);

  // Stores within radius
  const storesInRadius = await db.query(`
    SELECT name
    FROM stores
    WHERE ST_Distance_Sphere(location, ST_GeomFromText(?)) <= ?
  `, [userLocation, 5000]); // 5km radius
  console.log('Stores within 5km:', storesInRadius.rows);

  // Polygon contains point
  await db.execute(`
    UPDATE stores
    SET delivery_area = ST_GeomFromText(
      'POLYGON((40.7 -74.1, 40.8 -74.1, 40.8 -73.9, 40.7 -73.9, 40.7 -74.1))'
    )
    WHERE id = 1
  `);

  const canDeliver = await db.query(`
    SELECT name
    FROM stores
    WHERE ST_Contains(delivery_area, ST_GeomFromText(?))
  `, ['POINT(40.75 -74.0)']);
  console.log('Can deliver to location:', canDeliver.rows);
}

async function advancedIndexing(db: DBBridge) {
  console.log('\n=== Advanced Indexing ===');

  // Create composite index
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_products_brand_price 
    ON products((JSON_EXTRACT(details, '$.brand')), (JSON_EXTRACT(details, '$.price')))
  `);

  // Create covering index
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_articles_covering 
    ON articles(published_at, title, id)
  `);

  // Analyze index usage
  const explainQuery = await db.query(`
    EXPLAIN SELECT name, JSON_EXTRACT(details, '$.price') as price
    FROM products
    WHERE JSON_EXTRACT(details, '$.brand') = 'TechCorp'
  `);
  console.log('Query execution plan:', explainQuery.rows);

  // Index hints
  const forcedIndex = await db.query(`
    SELECT name
    FROM products USE INDEX (idx_products_brand_price)
    WHERE JSON_EXTRACT(details, '$.brand') = 'TechCorp'
  `);
  console.log('Results with forced index:', forcedIndex.rows);
}

async function storedProcedures(db: DBBridge) {
  console.log('\n=== Stored Procedures ===');

  // Create stored procedure
  await db.execute(`
    CREATE PROCEDURE IF NOT EXISTS GetProductsByPriceRange(
      IN min_price DECIMAL(10,2),
      IN max_price DECIMAL(10,2),
      OUT product_count INT
    )
    BEGIN
      SELECT COUNT(*) INTO product_count
      FROM products
      WHERE JSON_EXTRACT(details, '$.price') BETWEEN min_price AND max_price;
      
      SELECT 
        name,
        JSON_EXTRACT(details, '$.price') as price
      FROM products
      WHERE JSON_EXTRACT(details, '$.price') BETWEEN min_price AND max_price
      ORDER BY price;
    END
  `);

  // Call stored procedure
  await db.execute('SET @count = 0');
  const procResults = await db.query('CALL GetProductsByPriceRange(50, 500, @count)');
  const count = await db.query('SELECT @count as product_count');
  console.log('Products in range:', procResults.rows);
  console.log('Total count:', count.rows[0].product_count);

  // Create function
  await db.execute(`
    CREATE FUNCTION IF NOT EXISTS CalculateDiscount(price DECIMAL(10,2), percentage INT)
    RETURNS DECIMAL(10,2)
    DETERMINISTIC
    BEGIN
      RETURN price * (1 - percentage / 100);
    END
  `);

  // Use function
  const discountedPrices = await db.query(`
    SELECT 
      name,
      JSON_EXTRACT(details, '$.price') as original_price,
      CalculateDiscount(JSON_EXTRACT(details, '$.price'), 20) as sale_price
    FROM products
  `);
  console.log('Discounted prices:', discountedPrices.rows);
}

async function viewsExample(db: DBBridge) {
  console.log('\n=== Views Example ===');

  // Create view
  await db.execute(`
    CREATE OR REPLACE VIEW product_summary AS
    SELECT 
      p.id,
      p.name,
      JSON_UNQUOTE(JSON_EXTRACT(p.details, '$.brand')) as brand,
      JSON_EXTRACT(p.details, '$.price') as price,
      JSON_LENGTH(p.tags) as tag_count,
      COUNT(DISTINCT o.id) as order_count
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    LEFT JOIN orders o ON oi.order_id = o.id
    GROUP BY p.id
  `);

  // Query view
  const viewResults = await db.query(`
    SELECT * FROM product_summary
    WHERE price > 50
    ORDER BY order_count DESC
  `);
  console.log('Product summary:', viewResults.rows);

  // Create materialized view alternative (using table)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_stats_materialized AS
    SELECT 
      JSON_UNQUOTE(JSON_EXTRACT(details, '$.brand')) as brand,
      COUNT(*) as product_count,
      AVG(JSON_EXTRACT(details, '$.price')) as avg_price,
      MAX(JSON_EXTRACT(details, '$.price')) as max_price
    FROM products
    GROUP BY JSON_EXTRACT(details, '$.brand')
  `);
}

async function triggersExample(db: DBBridge) {
  console.log('\n=== Triggers Example ===');

  // Create audit table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_audit (
      id INT PRIMARY KEY AUTO_INCREMENT,
      product_id INT,
      action VARCHAR(10),
      old_price DECIMAL(10,2),
      new_price DECIMAL(10,2),
      changed_by VARCHAR(50),
      changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create trigger
  await db.execute(`
    CREATE TRIGGER IF NOT EXISTS product_price_audit
    AFTER UPDATE ON products
    FOR EACH ROW
    BEGIN
      IF JSON_EXTRACT(OLD.details, '$.price') != JSON_EXTRACT(NEW.details, '$.price') THEN
        INSERT INTO product_audit (product_id, action, old_price, new_price, changed_by)
        VALUES (
          NEW.id,
          'UPDATE',
          JSON_EXTRACT(OLD.details, '$.price'),
          JSON_EXTRACT(NEW.details, '$.price'),
          USER()
        );
      END IF;
    END
  `);

  // Test trigger
  await db.execute(`
    UPDATE products
    SET details = JSON_SET(details, '$.price', 999.99)
    WHERE id = 1
  `);

  const auditLog = await db.query('SELECT * FROM product_audit');
  console.log('Audit log:', auditLog.rows);
}

async function performanceOptimization(db: DBBridge) {
  console.log('\n=== Performance Optimization ===');

  // Analyze table
  await db.execute('ANALYZE TABLE products');

  // Show index statistics
  const indexStats = await db.query(`
    SELECT 
      table_name,
      index_name,
      cardinality,
      avg_row_length
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name IN ('products', 'articles', 'stores')
    ORDER BY table_name, index_name
  `);
  console.log('Index statistics:', indexStats.rows);

  // Optimize queries with EXPLAIN
  const explainAnalyze = await db.query(`
    EXPLAIN ANALYZE
    SELECT p.name, COUNT(oi.id) as sales
    FROM products p
    LEFT JOIN order_items oi ON p.id = oi.product_id
    GROUP BY p.id
    HAVING sales > 0
  `);
  console.log('Query analysis:', explainAnalyze.rows);

  // Partition example
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders_partitioned (
      id INT AUTO_INCREMENT,
      user_id INT,
      total DECIMAL(10,2),
      created_at DATETIME,
      PRIMARY KEY (id, created_at)
    )
    PARTITION BY RANGE (YEAR(created_at)) (
      PARTITION p2022 VALUES LESS THAN (2023),
      PARTITION p2023 VALUES LESS THAN (2024),
      PARTITION p2024 VALUES LESS THAN (2025),
      PARTITION pmax VALUES LESS THAN MAXVALUE
    )
  `);

  console.log('✅ Performance optimizations applied');
}

main().catch(console.error);