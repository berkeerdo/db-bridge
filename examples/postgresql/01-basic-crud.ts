/**
 * PostgreSQL Basic CRUD Operations
 * 
 * This example demonstrates PostgreSQL-specific features
 * including arrays, JSON, and advanced data types.
 */

import { DBBridge } from '@db-bridge/core';

async function main() {
  const db = DBBridge.postgresql({
    host: 'localhost',
    port: 5432,
    user: process.env.USER || 'postgres',
    password: '',
    database: 'postgres',
    pool: {
      min: 2,
      max: 10
    }
  });

  try {
    await db.connect();
    console.log('✅ Connected to PostgreSQL\n');

    // Create tables
    await setupTables(db);

    // Basic CRUD
    await basicCrud(db);

    // Array operations
    await arrayOperations(db);

    // JSON/JSONB operations
    await jsonOperations(db);

    // Advanced data types
    await advancedDataTypes(db);

    // PostgreSQL specific features
    await postgresFeatures(db);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('\n✅ Disconnected from PostgreSQL');
  }
}

async function setupTables(db: DBBridge) {
  console.log('=== Setting up tables ===');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      tags TEXT[],
      preferences JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      categories TEXT[],
      attributes JSONB,
      price DECIMAL(10,2),
      dimensions INTEGER[],
      available_colors TEXT[],
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      event_type VARCHAR(50),
      payload JSONB,
      tags TEXT[],
      occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      processed BOOLEAN DEFAULT FALSE
    )
  `);

  console.log('✅ Tables created\n');
}

async function basicCrud(db: DBBridge) {
  console.log('=== Basic CRUD Operations ===');

  // INSERT with RETURNING
  const result = await db.query(`
    INSERT INTO users (name, email, tags, preferences)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [
    'John Doe',
    'john@example.com',
    ['developer', 'postgres', 'nodejs'],
    JSON.stringify({ theme: 'dark', language: 'en' })
  ]);
  console.log('Inserted user:', result.rows[0]);

  // Bulk insert with UNNEST
  await db.execute(`
    INSERT INTO users (name, email, tags)
    SELECT * FROM UNNEST(
      $1::text[],
      $2::text[],
      $3::text[][]
    )
  `, [
    ['Jane Smith', 'Bob Johnson'],
    ['jane@example.com', 'bob@example.com'],
    [['designer', 'ui'], ['manager', 'team-lead']]
  ]);

  // UPDATE with RETURNING
  const updated = await db.query(`
    UPDATE users
    SET preferences = preferences || '{"notifications": true}'::jsonb
    WHERE email = $1
    RETURNING id, preferences
  `, ['john@example.com']);
  console.log('Updated preferences:', updated.rows[0]);

  // UPSERT with ON CONFLICT
  await db.execute(`
    INSERT INTO users (name, email, tags)
    VALUES ($1, $2, $3)
    ON CONFLICT (email)
    DO UPDATE SET
      name = EXCLUDED.name,
      tags = array_cat(users.tags, EXCLUDED.tags),
      updated_at = CURRENT_TIMESTAMP
  `, ['John Doe Updated', 'john@example.com', ['senior-dev']]);

  // DELETE with RETURNING
  const deleted = await db.query(`
    DELETE FROM users
    WHERE email = $1
    RETURNING name
  `, ['temp@example.com']);
  console.log('Deleted users:', deleted.rows);
}

async function arrayOperations(db: DBBridge) {
  console.log('\n=== Array Operations ===');

  // Insert with arrays
  await db.execute(`
    INSERT INTO products (name, categories, dimensions, available_colors)
    VALUES 
      ($1, $2, $3, $4),
      ($5, $6, $7, $8)
  `, [
    'Laptop', ['electronics', 'computers'], [30, 20, 2], ['silver', 'black'],
    'T-Shirt', ['clothing', 'casual'], [40, 60, 1], ['red', 'blue', 'white']
  ]);

  // Array contains
  const electronics = await db.query(`
    SELECT name, categories
    FROM products
    WHERE 'electronics' = ANY(categories)
  `);
  console.log('Electronics:', electronics.rows);

  // Array operations
  const arrayOps = await db.query(`
    SELECT 
      name,
      array_length(categories, 1) as category_count,
      array_to_string(available_colors, ', ') as colors,
      categories[1] as first_category,
      array_append(categories, 'sale') as with_sale_tag
    FROM products
  `);
  console.log('Array operations:', arrayOps.rows);

  // Array aggregation
  const colorStats = await db.query(`
    SELECT 
      unnest(available_colors) as color,
      COUNT(*) as product_count
    FROM products
    GROUP BY color
    ORDER BY product_count DESC
  `);
  console.log('Color statistics:', colorStats.rows);
}

async function jsonOperations(db: DBBridge) {
  console.log('\n=== JSON/JSONB Operations ===');

  // Insert complex JSON
  await db.execute(`
    INSERT INTO events (event_type, payload, tags)
    VALUES 
      ($1, $2, $3),
      ($4, $5, $6)
  `, [
    'user.signup',
    JSON.stringify({
      userId: 123,
      email: 'new@example.com',
      source: 'web',
      metadata: { campaign: 'summer2024' }
    }),
    ['signup', 'web'],
    'order.completed',
    JSON.stringify({
      orderId: 456,
      userId: 123,
      items: [
        { productId: 1, quantity: 2, price: 29.99 },
        { productId: 3, quantity: 1, price: 99.99 }
      ],
      total: 159.97
    }),
    ['order', 'completed']
  ]);

  // Query JSON fields
  const userEvents = await db.query(`
    SELECT 
      event_type,
      payload->>'userId' as user_id,
      payload->'metadata'->>'campaign' as campaign,
      jsonb_array_length(payload->'items') as item_count
    FROM events
    WHERE payload->>'userId' = '123'
  `);
  console.log('User events:', userEvents.rows);

  // JSON aggregation
  const orderStats = await db.query(`
    SELECT 
      jsonb_agg(payload ORDER BY occurred_at) as all_orders,
      jsonb_build_object(
        'total_orders', COUNT(*),
        'total_revenue', SUM((payload->>'total')::numeric),
        'avg_items', AVG(jsonb_array_length(payload->'items'))
      ) as statistics
    FROM events
    WHERE event_type = 'order.completed'
  `);
  console.log('Order statistics:', orderStats.rows[0]?.statistics);

  // Update JSON
  await db.execute(`
    UPDATE events
    SET 
      payload = jsonb_set(
        payload,
        '{processed_at}',
        to_jsonb(CURRENT_TIMESTAMP)
      ),
      processed = true
    WHERE event_type = 'user.signup'
      AND NOT processed
  `);
}

async function advancedDataTypes(db: DBBridge) {
  console.log('\n=== Advanced Data Types ===');

  // Create table with advanced types
  await db.execute(`
    CREATE TABLE IF NOT EXISTS advanced_types (
      id SERIAL PRIMARY KEY,
      uuid_field UUID DEFAULT gen_random_uuid(),
      ip_address INET,
      mac_address MACADDR,
      price_range INT4RANGE,
      valid_period TSTZRANGE,
      tags TEXT[],
      metadata JSONB,
      is_active BOOLEAN DEFAULT true
    )
  `);

  // Insert with advanced types
  await db.execute(`
    INSERT INTO advanced_types (
      ip_address, 
      mac_address, 
      price_range, 
      valid_period,
      tags
    )
    VALUES (
      '192.168.1.100',
      '08:00:2b:01:02:03',
      '[100, 500)',
      '[2024-01-01, 2024-12-31)',
      ARRAY['network', 'device']
    )
  `);

  // Query with range operations
  const rangeQuery = await db.query(`
    SELECT 
      uuid_field,
      ip_address,
      price_range,
      lower(price_range) as min_price,
      upper(price_range) as max_price,
      300 <@ price_range as includes_300,
      isempty(valid_period) as is_expired
    FROM advanced_types
  `);
  console.log('Advanced types:', rangeQuery.rows);
}

async function postgresFeatures(db: DBBridge) {
  console.log('\n=== PostgreSQL Specific Features ===');

  // Common Table Expression (CTE)
  const cteResult = await db.query(`
    WITH user_stats AS (
      SELECT 
        id,
        name,
        array_length(tags, 1) as tag_count,
        jsonb_object_keys(preferences) as pref_key
      FROM users
    )
    SELECT 
      name,
      tag_count,
      array_agg(DISTINCT pref_key) as preference_keys
    FROM user_stats
    GROUP BY id, name, tag_count
  `);
  console.log('CTE results:', cteResult.rows);

  // Window functions
  const windowResult = await db.query(`
    SELECT 
      name,
      price,
      AVG(price) OVER () as avg_price,
      price - AVG(price) OVER () as price_diff,
      ROW_NUMBER() OVER (ORDER BY price DESC) as price_rank,
      DENSE_RANK() OVER (ORDER BY array_length(categories, 1) DESC) as category_rank
    FROM products
  `);
  console.log('Window functions:', windowResult.rows);

  // Generate series
  const series = await db.query(`
    SELECT 
      date_trunc('day', ts) as day,
      COUNT(e.*) as event_count
    FROM generate_series(
      CURRENT_DATE - INTERVAL '7 days',
      CURRENT_DATE,
      INTERVAL '1 day'
    ) ts
    LEFT JOIN events e ON date_trunc('day', e.occurred_at) = date_trunc('day', ts)
    GROUP BY day
    ORDER BY day
  `);
  console.log('Daily event counts:', series.rows);

  // Full-text search setup
  await db.execute(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;
    
    UPDATE products 
    SET search_vector = to_tsvector('english', name || ' ' || COALESCE(array_to_string(categories, ' '), ''));
    
    CREATE INDEX IF NOT EXISTS idx_products_search ON products USING GIN(search_vector);
  `);

  // Full-text search
  const searchResults = await db.query(`
    SELECT 
      name,
      categories,
      ts_rank(search_vector, query) as rank
    FROM products,
         to_tsquery('english', 'laptop | computer') query
    WHERE search_vector @@ query
    ORDER BY rank DESC
  `);
  console.log('Search results:', searchResults.rows);
}

main().catch(console.error);