/**
 * Query Builder Examples
 * 
 * This example demonstrates the powerful query builder
 * features of DB Bridge.
 */

import { DBBridge } from '@db-bridge/core';

async function basicQueries(db: DBBridge) {
  console.log('\n=== Basic Query Builder ===');

  // SELECT all
  const allUsers = await db.table('users').get();
  console.log('All users count:', allUsers.length);

  // SELECT with columns
  const userNames = await db.table('users')
    .select('id', 'name', 'email')
    .get();
  console.log('Selected columns:', Object.keys(userNames[0] || {}));

  // WHERE conditions
  const activeUsers = await db.table('users')
    .where('active', true)
    .where('role', 'user')
    .get();
  console.log('Active users:', activeUsers.length);

  // Multiple WHERE conditions
  const filteredUsers = await db.table('users')
    .where('age', '>=', 18)
    .where('age', '<=', 65)
    .where('country', 'USA')
    .get();
  console.log('Filtered users:', filteredUsers.length);
}

async function advancedQueries(db: DBBridge) {
  console.log('\n=== Advanced Query Builder ===');

  // WHERE IN
  const admins = await db.table('users')
    .whereIn('role', ['admin', 'superadmin'])
    .get();
  console.log('Admin users:', admins.length);

  // WHERE NOT IN
  const nonAdmins = await db.table('users')
    .whereNotIn('role', ['admin', 'superadmin'])
    .get();
  console.log('Non-admin users:', nonAdmins.length);

  // WHERE BETWEEN
  const ageRange = await db.table('users')
    .whereBetween('age', [25, 35])
    .get();
  console.log('Users age 25-35:', ageRange.length);

  // WHERE NULL / NOT NULL
  const verifiedUsers = await db.table('users')
    .whereNotNull('email_verified_at')
    .get();
  console.log('Verified users:', verifiedUsers.length);

  // OR conditions
  const specialUsers = await db.table('users')
    .where('role', 'admin')
    .orWhere('vip', true)
    .get();
  console.log('Admin or VIP users:', specialUsers.length);

  // Complex OR groups
  const complexQuery = await db.table('users')
    .where('active', true)
    .where((qb) => {
      qb.where('role', 'admin')
        .orWhere('points', '>', 1000);
    })
    .get();
  console.log('Complex query results:', complexQuery.length);
}

async function sorting(db: DBBridge) {
  console.log('\n=== Sorting & Limiting ===');

  // ORDER BY single column
  const sortedByName = await db.table('users')
    .orderBy('name', 'asc')
    .limit(10)
    .get();
  console.log('First user by name:', sortedByName[0]?.name);

  // ORDER BY multiple columns
  const multiSort = await db.table('users')
    .orderBy('role', 'asc')
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();
  console.log('Multi-sorted users:', multiSort.length);

  // LIMIT and OFFSET (pagination)
  const page = 2;
  const perPage = 10;
  const paginated = await db.table('users')
    .orderBy('id')
    .limit(perPage)
    .offset((page - 1) * perPage)
    .get();
  console.log(`Page ${page} users:`, paginated.length);
}

async function aggregations(db: DBBridge) {
  console.log('\n=== Aggregations ===');

  // COUNT
  const totalUsers = await db.table('users').count();
  console.log('Total users:', totalUsers);

  // COUNT with condition
  const activeCount = await db.table('users')
    .where('active', true)
    .count();
  console.log('Active users count:', activeCount);

  // SUM
  const totalPoints = await db.table('users').sum('points');
  console.log('Total points:', totalPoints);

  // AVG
  const avgAge = await db.table('users').avg('age');
  console.log('Average age:', avgAge);

  // MIN / MAX
  const minAge = await db.table('users').min('age');
  const maxAge = await db.table('users').max('age');
  console.log('Age range:', minAge, '-', maxAge);

  // GROUP BY
  const usersByRole = await db.table('users')
    .select('role')
    .count('id as count')
    .groupBy('role')
    .get();
  console.log('Users by role:', usersByRole);
}

async function joins(db: DBBridge) {
  console.log('\n=== JOIN Operations ===');

  // INNER JOIN
  const ordersWithUsers = await db.table('orders')
    .join('users', 'orders.user_id', '=', 'users.id')
    .select('orders.*', 'users.name as customer_name')
    .get();
  console.log('Orders with customer names:', ordersWithUsers.length);

  // LEFT JOIN
  const usersWithOrders = await db.table('users')
    .leftJoin('orders', 'users.id', '=', 'orders.user_id')
    .select('users.name', 'orders.id as order_id')
    .get();
  console.log('Users with optional orders:', usersWithOrders.length);

  // Multiple JOINs
  const fullOrderDetails = await db.table('order_items')
    .join('orders', 'order_items.order_id', '=', 'orders.id')
    .join('products', 'order_items.product_id', '=', 'products.id')
    .join('users', 'orders.user_id', '=', 'users.id')
    .select(
      'order_items.quantity',
      'order_items.price',
      'products.name as product_name',
      'users.name as customer_name',
      'orders.created_at as order_date'
    )
    .where('orders.status', 'completed')
    .get();
  console.log('Full order details:', fullOrderDetails.length);
}

async function rawQueries(db: DBBridge) {
  console.log('\n=== Raw Queries ===');

  // Raw WHERE conditions
  const customWhere = await db.table('users')
    .whereRaw('age > ? AND points > ?', [18, 100])
    .get();
  console.log('Custom WHERE results:', customWhere.length);

  // Raw SELECT
  const rawSelect = await db.table('users')
    .select('*')
    .selectRaw('CONCAT(first_name, " ", last_name) as full_name')
    .selectRaw('YEAR(CURDATE()) - YEAR(birth_date) as calculated_age')
    .limit(5)
    .get();
  console.log('Raw SELECT example:', rawSelect[0]);

  // Full raw query
  const rawQuery = await db.query(
    'SELECT role, COUNT(*) as count FROM users GROUP BY role HAVING COUNT(*) > ?',
    [5]
  );
  console.log('Raw query results:', rawQuery.rows);
}

async function subqueries(db: DBBridge) {
  console.log('\n=== Subqueries ===');

  // WHERE EXISTS
  const usersWithOrders = await db.table('users')
    .whereExists((qb) => {
      qb.select('*')
        .from('orders')
        .whereRaw('orders.user_id = users.id');
    })
    .get();
  console.log('Users with orders:', usersWithOrders.length);

  // WHERE IN subquery
  const highValueUsers = await db.table('users')
    .whereIn('id', (qb) => {
      qb.select('user_id')
        .from('orders')
        .where('total', '>', 1000);
    })
    .get();
  console.log('High value users:', highValueUsers.length);
}

// Main function
async function main() {
  console.log('=== Query Builder Examples ===');
  
  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  try {
    await db.connect();
    console.log('✅ Connected to database');

    // Run examples
    await basicQueries(db);
    await advancedQueries(db);
    await sorting(db);
    await aggregations(db);
    await joins(db);
    await rawQueries(db);
    await subqueries(db);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.disconnect();
    console.log('\n✅ Disconnected from database');
  }
}

main().catch(console.error);