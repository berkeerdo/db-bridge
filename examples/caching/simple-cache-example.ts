/**
 * db-bridge Simple Cache Example
 *
 * Industry-leading cache API inspired by Drizzle ORM, TypeORM, and Prisma
 */

import { CachedDBBridge } from '@db-bridge/core';

async function main() {
  // ============================================
  // KOLAY KURULUM - Tek Config!
  // ============================================

  const db = CachedDBBridge.mysql({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'myapp',

    // Cache config - Bu kadar basit!
    cache: {
      redis: 'redis://localhost:6379',
      ttl: 3600, // Default 1 saat
      global: false, // Explicit caching (opt-in)
      autoInvalidate: true, // INSERT/UPDATE/DELETE'te otomatik invalidation
    },
  });

  await db.connect();
  console.log('Connected with cache enabled:', db.isCacheEnabled);

  // ============================================
  // QUERY CACHING - $withCache() ile
  // ============================================

  // Normal sorgu - cache yok
  const result1 = await db.query('SELECT * FROM users');
  console.log('Normal query:', result1.rows.length, 'rows');

  // Cache ile - $withCache()
  const result2 = await db.query('SELECT * FROM users').$withCache();
  console.log('Cached query:', result2.rows.length, 'rows');

  // Özel TTL ile
  const result3 = await db.query('SELECT * FROM products').$withCache({
    ttl: 60, // 1 dakika
    tags: ['products', 'catalog'],
  });

  // Aynı sorgu tekrar - CACHE HIT!
  const result4 = await db.query('SELECT * FROM users').$withCache();
  console.log('From cache:', result4.rows.length, 'rows');

  // ============================================
  // GLOBAL CACHE MODE
  // ============================================

  // global: true ile tüm SELECT'ler otomatik cache'lenir
  // Cache kapatmak için: .$withCache(false)

  // ============================================
  // $cache API - Drizzle Style
  // ============================================

  // Statistics
  const stats = db.$cache.stats();
  console.log('Cache stats:', {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: (stats.hitRate * 100).toFixed(1) + '%',
  });

  // Table-based invalidation
  await db.$cache.invalidate({ tables: ['users'] });
  await db.$cache.invalidate({ tables: ['users', 'posts', 'comments'] });

  // Tag-based invalidation
  await db.$cache.invalidate({ tags: ['catalog'] });
  await db.$cache.invalidate({ tags: ['user-123', 'premium'] });

  // Clear all
  await db.$cache.clear();

  // ============================================
  // AUTO-INVALIDATION
  // ============================================

  // INSERT/UPDATE/DELETE otomatik ilgili tabloyu invalidate eder
  await db.execute('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@test.com']);
  // ^ users tablosu cache'i otomatik temizlendi!

  await db.execute('UPDATE products SET price = ? WHERE id = ?', [99.99, 1]);
  // ^ products tablosu cache'i otomatik temizlendi!

  // ============================================
  // CACHE KEY GENERATOR
  // ============================================

  const keyGen = db.$cache.key();

  // Çeşitli key formatları
  console.log(keyGen.forTable('users').withId(123).build());
  // => 'db-bridge:table:users:id:123'

  console.log(keyGen.forQuery('SELECT * FROM users WHERE status = ?', ['active']).build());
  // => 'db-bridge:query:abc123def'

  console.log(keyGen.forTable('users').withField('email', 'test@test.com').build());
  // => 'db-bridge:table:users:field:email:hash123'

  // ============================================
  // WARMUP - Preload Popular Queries
  // ============================================

  await db.$cache.warmup([
    { sql: 'SELECT * FROM settings', ttl: 86400 },
    { sql: 'SELECT * FROM categories', ttl: 3600 },
  ]);

  // ============================================
  // EVENT LISTENERS
  // ============================================

  db.on('cacheHit', ({ key, sql }) => {
    console.log('Cache HIT:', key);
  });

  db.on('cacheMiss', ({ key, sql }) => {
    console.log('Cache MISS:', key);
  });

  db.on('cacheInvalidated', ({ tables, command }) => {
    console.log(`Cache invalidated for ${tables.join(', ')} after ${command}`);
  });

  // ============================================
  // CLEANUP
  // ============================================

  await db.disconnect();
  console.log('Disconnected!');
}

main().catch(console.error);
