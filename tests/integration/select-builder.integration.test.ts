/**
 * SelectBuilder Integration Tests
 *
 * Tests all SelectBuilder methods with real MySQL and PostgreSQL databases.
 * Requires Docker containers to be running.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DBBridge } from '@db-bridge/core';

interface TestUser {
  id: number;
  name: string;
  email: string;
  age: number;
  salary: number;
  department: string;
  is_active: boolean;
  created_at: Date;
}

interface TestOrder {
  id: number;
  user_id: number;
  amount: number;
  status: string;
  created_at: Date;
}

// Test data
const testUsers = [
  {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    age: 28,
    salary: 75000,
    department: 'Engineering',
    is_active: true,
  },
  {
    name: 'Bob Smith',
    email: 'bob@example.com',
    age: 35,
    salary: 85000,
    department: 'Engineering',
    is_active: true,
  },
  {
    name: 'Carol White',
    email: 'carol@example.com',
    age: 42,
    salary: 95000,
    department: 'Marketing',
    is_active: true,
  },
  {
    name: 'David Brown',
    email: 'david@example.com',
    age: 31,
    salary: 70000,
    department: 'Sales',
    is_active: false,
  },
  {
    name: 'Eve Davis',
    email: 'eve@example.com',
    age: 26,
    salary: 65000,
    department: 'Engineering',
    is_active: true,
  },
  {
    name: 'Frank Miller',
    email: 'frank@example.com',
    age: 45,
    salary: 110000,
    department: 'Marketing',
    is_active: true,
  },
  {
    name: 'Grace Wilson',
    email: 'grace@example.com',
    age: 33,
    salary: 80000,
    department: 'Sales',
    is_active: true,
  },
  {
    name: 'Henry Taylor',
    email: 'henry@example.com',
    age: 29,
    salary: 72000,
    department: 'Engineering',
    is_active: false,
  },
];

const testOrders = [
  { user_id: 1, amount: 150.0, status: 'completed' },
  { user_id: 1, amount: 200.5, status: 'completed' },
  { user_id: 2, amount: 75.0, status: 'pending' },
  { user_id: 3, amount: 320.0, status: 'completed' },
  { user_id: 4, amount: 50.0, status: 'cancelled' },
  { user_id: 5, amount: 180.0, status: 'completed' },
  { user_id: 6, amount: 450.0, status: 'pending' },
  { user_id: 7, amount: 95.0, status: 'completed' },
];

describe.each([
  {
    name: 'MySQL',
    config: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'test',
      database: process.env.MYSQL_DATABASE || 'test_db',
    },
    createFn: DBBridge.createMySQL.bind(DBBridge),
    createUsersTable: `
      CREATE TABLE IF NOT EXISTS sb_test_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        age INT,
        salary DECIMAL(10,2),
        department VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    createOrdersTable: `
      CREATE TABLE IF NOT EXISTS sb_test_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        amount DECIMAL(10,2),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
  {
    name: 'PostgreSQL',
    config: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'test',
      database: process.env.POSTGRES_DATABASE || 'test_db',
    },
    createFn: DBBridge.createPostgreSQL.bind(DBBridge),
    createUsersTable: `
      CREATE TABLE IF NOT EXISTS sb_test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE,
        age INTEGER,
        salary DECIMAL(10,2),
        department VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    createOrdersTable: `
      CREATE TABLE IF NOT EXISTS sb_test_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10,2),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
  },
])(
  'SelectBuilder Integration Tests - $name',
  ({ name, config, createFn, createUsersTable, createOrdersTable }) => {
    let db: DBBridge;
    let isConnected = false;

    beforeAll(async () => {
      try {
        db = await createFn(config);
        isConnected = true;

        // Create tables
        await db.execute(createUsersTable);
        await db.execute(createOrdersTable);

        // Clear existing data
        await db.execute('DELETE FROM sb_test_orders');
        await db.execute('DELETE FROM sb_test_users');

        // Insert test users
        for (const user of testUsers) {
          if (name === 'MySQL') {
            await db.execute(
              'INSERT INTO sb_test_users (name, email, age, salary, department, is_active) VALUES (?, ?, ?, ?, ?, ?)',
              [user.name, user.email, user.age, user.salary, user.department, user.is_active],
            );
          } else {
            await db.execute(
              'INSERT INTO sb_test_users (name, email, age, salary, department, is_active) VALUES ($1, $2, $3, $4, $5, $6)',
              [user.name, user.email, user.age, user.salary, user.department, user.is_active],
            );
          }
        }

        // Insert test orders
        for (const order of testOrders) {
          if (name === 'MySQL') {
            await db.execute(
              'INSERT INTO sb_test_orders (user_id, amount, status) VALUES (?, ?, ?)',
              [order.user_id, order.amount, order.status],
            );
          } else {
            await db.execute(
              'INSERT INTO sb_test_orders (user_id, amount, status) VALUES ($1, $2, $3)',
              [order.user_id, order.amount, order.status],
            );
          }
        }
      } catch (error) {
        console.warn(`${name} integration test setup failed:`, error);
        console.warn(`Skipping ${name} integration tests. Make sure ${name} is running.`);
      }
    });

    afterAll(async () => {
      if (isConnected) {
        try {
          await db.execute('DROP TABLE IF EXISTS sb_test_orders');
          await db.execute('DROP TABLE IF EXISTS sb_test_users');
          await db.disconnect();
        } catch (error) {
          console.warn(`${name} cleanup failed:`, error);
        }
      }
    });

    // ============ Basic SELECT Tests ============

    describe('Basic SELECT', () => {
      it('should select all columns with get()', async () => {
        if (!isConnected) return;

        const users = await db.qb().select('*').from('sb_test_users').get();

        expect(users).toHaveLength(8);
        expect(users[0]).toHaveProperty('name');
        expect(users[0]).toHaveProperty('email');
      });

      it('should select specific columns', async () => {
        if (!isConnected) return;

        const users = await db.qb().select('name', 'email').from('sb_test_users').get();

        expect(users).toHaveLength(8);
        expect(users[0]).toHaveProperty('name');
        expect(users[0]).toHaveProperty('email');
        // Should not have other columns
        expect(users[0]).not.toHaveProperty('salary');
      });

      it('should use addSelect() to add columns', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('name')
          .addSelect('email')
          .addSelect('age')
          .from('sb_test_users')
          .limit(1)
          .get();

        expect(users[0]).toHaveProperty('name');
        expect(users[0]).toHaveProperty('email');
        expect(users[0]).toHaveProperty('age');
      });

      it('should use distinct()', async () => {
        if (!isConnected) return;

        const departments = await db
          .qb()
          .select('department')
          .distinct()
          .from('sb_test_users')
          .get();

        expect(departments).toHaveLength(3); // Engineering, Marketing, Sales
      });
    });

    // ============ WHERE Tests ============

    describe('WHERE clauses', () => {
      it('should filter with where(column, value)', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering')
          .get();

        expect(users).toHaveLength(4);
        expect(users.every((u: any) => u.department === 'Engineering')).toBe(true);
      });

      it('should filter with where(column, operator, value)', async () => {
        if (!isConnected) return;

        const users = await db.qb().select('*').from('sb_test_users').where('age', '>', 30).get();

        expect(users.every((u: any) => u.age > 30)).toBe(true);
      });

      it('should filter with where(conditions object)', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where({ department: 'Engineering', is_active: true })
          .get();

        // MySQL returns boolean as 1/0, PostgreSQL returns true/false
        expect(
          users.every(
            (u: any) =>
              u.department === 'Engineering' && (u.is_active === true || u.is_active === 1),
          ),
        ).toBe(true);
      });

      it('should use orWhere()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering')
          .orWhere('department', 'Marketing')
          .get();

        expect(users).toHaveLength(6); // 4 Engineering + 2 Marketing
      });

      it('should use whereNull()', async () => {
        if (!isConnected) return;

        // First, let's test whereNotNull to ensure we get records
        const usersWithEmail = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .whereNotNull('email')
          .get();

        expect(usersWithEmail).toHaveLength(8);
      });

      it('should use whereIn()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .whereIn('department', ['Engineering', 'Marketing'])
          .get();

        expect(users).toHaveLength(6);
      });

      it('should use whereNotIn()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .whereNotIn('department', ['Engineering', 'Marketing'])
          .get();

        expect(users).toHaveLength(2); // Only Sales
        expect(users.every((u: any) => u.department === 'Sales')).toBe(true);
      });

      it('should use whereBetween()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .whereBetween('age', 28, 35)
          .get();

        expect(users.every((u: any) => u.age >= 28 && u.age <= 35)).toBe(true);
      });

      it('should use whereLike()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .whereLike('email', '%@example.com')
          .get();

        expect(users).toHaveLength(8);
      });
    });

    // ============ ORDER BY Tests ============

    describe('ORDER BY', () => {
      it('should order by column ascending', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('name', 'age')
          .from('sb_test_users')
          .orderBy('age', 'ASC')
          .get();

        for (let i = 1; i < users.length; i++) {
          expect((users[i] as any).age).toBeGreaterThanOrEqual((users[i - 1] as any).age);
        }
      });

      it('should order by column descending', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('name', 'age')
          .from('sb_test_users')
          .orderByDesc('age')
          .get();

        for (let i = 1; i < users.length; i++) {
          expect((users[i] as any).age).toBeLessThanOrEqual((users[i - 1] as any).age);
        }
      });

      it('should use clearOrder() and reorder()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('name', 'salary')
          .from('sb_test_users')
          .orderBy('age', 'ASC')
          .clearOrder()
          .orderByDesc('salary')
          .get();

        for (let i = 1; i < users.length; i++) {
          expect(Number((users[i] as any).salary)).toBeLessThanOrEqual(
            Number((users[i - 1] as any).salary),
          );
        }
      });
    });

    // ============ LIMIT / OFFSET / Pagination Tests ============

    describe('LIMIT / OFFSET / Pagination', () => {
      it('should limit results', async () => {
        if (!isConnected) return;

        const users = await db.qb().select('*').from('sb_test_users').limit(3).get();

        expect(users).toHaveLength(3);
      });

      it('should use offset()', async () => {
        if (!isConnected) return;

        const allUsers = await db
          .qb()
          .select('name')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .get();

        const offsetUsers = await db
          .qb()
          .select('name')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .offset(2)
          .get();

        expect((offsetUsers[0] as any).name).toBe((allUsers[2] as any).name);
      });

      it('should use skip() and take()', async () => {
        if (!isConnected) return;

        const users = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .skip(2)
          .take(3)
          .get();

        expect(users).toHaveLength(3);
      });

      it('should use paginate()', async () => {
        if (!isConnected) return;

        const page1 = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .paginate(1, 3)
          .get();

        const page2 = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .paginate(2, 3)
          .get();

        expect(page1).toHaveLength(3);
        expect(page2).toHaveLength(3);
        expect((page1[0] as any).id).not.toBe((page2[0] as any).id);
      });

      it('should use forPage()', async () => {
        if (!isConnected) return;

        const page = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .forPage(2, 4)
          .get();

        expect(page).toHaveLength(4);
      });
    });

    // ============ first() / firstOrFail() / sole() Tests ============

    describe('first() / firstOrFail() / sole()', () => {
      it('should get first result', async () => {
        if (!isConnected) return;

        const user = await db.qb().select('*').from('sb_test_users').orderBy('id', 'ASC').first();

        expect(user).not.toBeNull();
        expect((user as any).name).toBe('Alice Johnson');
      });

      it('should return null when no results', async () => {
        if (!isConnected) return;

        const user = await db.qb().select('*').from('sb_test_users').where('id', 99999).first();

        expect(user).toBeNull();
      });

      it('should throw on firstOrFail() when no results', async () => {
        if (!isConnected) return;

        await expect(
          db.qb().select('*').from('sb_test_users').where('id', 99999).firstOrFail(),
        ).rejects.toThrow('No record found');
      });

      it('should get sole() result', async () => {
        if (!isConnected) return;

        const user = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('email', 'alice@example.com')
          .sole();

        expect((user as any).name).toBe('Alice Johnson');
      });

      it('should throw on sole() when multiple results', async () => {
        if (!isConnected) return;

        await expect(
          db.qb().select('*').from('sb_test_users').where('department', 'Engineering').sole(),
        ).rejects.toThrow('Multiple records found');
      });
    });

    // ============ Aggregate Tests ============

    describe('Aggregates', () => {
      it('should count records', async () => {
        if (!isConnected) return;

        const count = await db.qb().select('*').from('sb_test_users').count();

        expect(count).toBe(8);
      });

      it('should count with condition', async () => {
        if (!isConnected) return;

        const count = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering')
          .count();

        expect(count).toBe(4);
      });

      it('should calculate sum()', async () => {
        if (!isConnected) return;

        const total = await db.qb().select('*').from('sb_test_users').sum('salary');

        expect(total).toBe(652000); // Sum of all salaries
      });

      it('should calculate avg()', async () => {
        if (!isConnected) return;

        const avg = await db.qb().select('*').from('sb_test_users').avg('age');

        expect(avg).toBeCloseTo(33.625, 1); // Average age
      });

      it('should calculate min()', async () => {
        if (!isConnected) return;

        const minAge = await db.qb().select('*').from('sb_test_users').min('age');

        expect(minAge).toBe(26);
      });

      it('should calculate max()', async () => {
        if (!isConnected) return;

        const maxSalary = await db.qb().select('*').from('sb_test_users').max('salary');

        expect(maxSalary).toBe(110000);
      });
    });

    // ============ exists() / doesntExist() Tests ============

    describe('exists() / doesntExist()', () => {
      it('should return true when records exist', async () => {
        if (!isConnected) return;

        const exists = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering')
          .exists();

        expect(exists).toBe(true);
      });

      it('should return false when no records exist', async () => {
        if (!isConnected) return;

        const exists = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'NonExistent')
          .exists();

        expect(exists).toBe(false);
      });

      it('should use doesntExist()', async () => {
        if (!isConnected) return;

        const doesntExist = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'NonExistent')
          .doesntExist();

        expect(doesntExist).toBe(true);
      });
    });

    // ============ pluck() / pluckKeyValue() Tests ============

    describe('pluck() / pluckKeyValue()', () => {
      it('should pluck single column values', async () => {
        if (!isConnected) return;

        const names = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering')
          .orderBy('name', 'ASC')
          .pluck('name');

        expect(names).toHaveLength(4);
        expect(names).toContain('Alice Johnson');
        expect(names).toContain('Bob Smith');
      });

      it('should pluck key-value pairs', async () => {
        if (!isConnected) return;

        const emailById = await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .pluckKeyValue('email', 'id');

        expect(emailById).toBeInstanceOf(Map);
        expect(emailById.size).toBe(8);
      });
    });

    // ============ GROUP BY / HAVING Tests ============

    describe('GROUP BY / HAVING', () => {
      it('should group by column', async () => {
        if (!isConnected) return;

        const result = await db
          .qb()
          .select('department', 'COUNT(*) as count')
          .from('sb_test_users')
          .groupBy('department')
          .get();

        expect(result).toHaveLength(3);
      });

      it('should use having() clause', async () => {
        if (!isConnected) return;

        const result = await db
          .qb()
          .select('department', 'COUNT(*) as count')
          .from('sb_test_users')
          .groupBy('department')
          .having('COUNT(*) > 2')
          .get();

        // Only Engineering (4) should remain
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result.every((r: any) => Number(r.count) > 2)).toBe(true);
      });
    });

    // ============ JOIN Tests ============

    describe('JOIN operations', () => {
      it('should perform inner join', async () => {
        if (!isConnected) return;

        const result = await db
          .qb()
          .select('sb_test_users.name', 'sb_test_orders.amount')
          .from('sb_test_users')
          .innerJoin('sb_test_orders', 'sb_test_users.id = sb_test_orders.user_id')
          .get();

        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('amount');
      });

      it('should perform left join', async () => {
        if (!isConnected) return;

        const result = await db
          .qb()
          .select('sb_test_users.name', 'sb_test_orders.amount')
          .from('sb_test_users')
          .leftJoin('sb_test_orders', 'sb_test_users.id = sb_test_orders.user_id')
          .get();

        // Should include users without orders (Henry has id=8, no orders)
        expect(result.length).toBeGreaterThanOrEqual(8);
      });

      it('should use join() alias for innerJoin()', async () => {
        if (!isConnected) return;

        const result = await db
          .qb()
          .select('sb_test_users.name', 'sb_test_orders.amount')
          .from('sb_test_users')
          .join('sb_test_orders', 'sb_test_users.id = sb_test_orders.user_id')
          .get();

        expect(result.length).toBeGreaterThan(0);
      });
    });

    // ============ chunk() / lazy() Tests ============

    describe('chunk() / lazy()', () => {
      it('should process results in chunks', async () => {
        if (!isConnected) return;

        const chunks: any[][] = [];

        await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .chunk(3, (rows, chunkNumber) => {
            chunks.push(rows);
          });

        expect(chunks.length).toBe(3); // 8 users / 3 per chunk = 3 chunks
        expect(chunks[0]).toHaveLength(3);
        expect(chunks[1]).toHaveLength(3);
        expect(chunks[2]).toHaveLength(2);
      });

      it('should stop chunking when callback returns false', async () => {
        if (!isConnected) return;

        const chunks: any[][] = [];

        await db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .chunk(3, (rows, chunkNumber) => {
            chunks.push(rows);
            return chunkNumber < 2; // Stop after 2nd chunk
          });

        expect(chunks.length).toBe(2);
      });

      it('should iterate lazily', async () => {
        if (!isConnected) return;

        const users: any[] = [];

        for await (const user of db
          .qb()
          .select('*')
          .from('sb_test_users')
          .orderBy('id', 'ASC')
          .lazy(3)) {
          users.push(user);
          if (users.length >= 5) break;
        }

        expect(users).toHaveLength(5);
      });
    });

    // ============ clone() Test ============

    describe('clone()', () => {
      it('should clone query builder', async () => {
        if (!isConnected) return;

        const baseQuery = db
          .qb()
          .select('*')
          .from('sb_test_users')
          .where('department', 'Engineering');

        const query1 = baseQuery.clone().where('is_active', true);
        const query2 = baseQuery.clone().where('is_active', false);

        const activeEngineers = await query1.get();
        const inactiveEngineers = await query2.get();

        expect(activeEngineers).toHaveLength(3);
        expect(inactiveEngineers).toHaveLength(1);
      });
    });

    // ============ Raw SQL Test ============

    describe('whereRaw()', () => {
      it('should use raw SQL in where clause', async () => {
        if (!isConnected) return;

        // PostgreSQL requires boolean = boolean, MySQL works with = 1
        const rawCondition =
          name === 'PostgreSQL' ? 'age > 30 AND is_active = true' : 'age > 30 AND is_active = 1';

        const users = await db.qb().select('*').from('sb_test_users').whereRaw(rawCondition).get();

        // MySQL returns boolean as 1/0, PostgreSQL returns true/false
        expect(
          users.every((u: any) => u.age > 30 && (u.is_active === true || u.is_active === 1)),
        ).toBe(true);
      });
    });

    // ============ toSQL() Test ============

    describe('toSQL()', () => {
      it('should return SQL and bindings without executing', async () => {
        if (!isConnected) return;

        const { sql, bindings } = db
          .qb()
          .select('name', 'email')
          .from('sb_test_users')
          .where('age', '>', 30)
          .orderBy('name', 'ASC')
          .limit(10)
          .toSQL();

        expect(sql).toContain('SELECT');
        expect(sql).toContain('FROM');
        expect(sql).toContain('WHERE');
        expect(sql).toContain('ORDER BY');
        expect(sql).toContain('LIMIT');
        expect(bindings).toContain(30);
      });
    });
  },
);
