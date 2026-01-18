/**
 * Query Builder Performance Benchmarks
 *
 * Measures the performance of SQL query generation.
 * Run with: npx tsx benchmarks/query-builder.bench.ts
 */

import { performance } from 'perf_hooks';
import { MySQLDialect, PostgreSQLDialect } from '@db-bridge/core';
import { SelectBuilder } from '../packages/core/src/query/select-builder';
import type { QueryContext } from '../packages/core/src/query/query-context';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Mock QueryContext
function createMockContext(dialect: 'mysql' | 'postgresql' = 'mysql'): QueryContext {
  const dialectInstance = dialect === 'mysql' ? new MySQLDialect() : new PostgreSQLDialect();

  return {
    dialect: dialectInstance,
    hasCache: false,
    hasCrypto: false,
    cacheConfig: undefined,
    async executeQuery<T>() {
      return { rows: [] as T[], rowCount: 0, fields: [] };
    },
    async executeCachedQuery<T>() {
      return { rows: [] as T[], rowCount: 0, fields: [] };
    },
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
  };
}

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
}

function benchmark(name: string, fn: () => void, iterations = 10000): BenchmarkResult {
  // Warmup
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const totalMs = performance.now() - start;
  const avgMs = totalMs / iterations;
  const opsPerSec = Math.round(1000 / avgMs);

  return { name, iterations, totalMs, avgMs, opsPerSec };
}

function printResult(result: BenchmarkResult) {
  const opsColor =
    result.opsPerSec > 100000
      ? colors.green
      : result.opsPerSec > 10000
        ? colors.yellow
        : colors.reset;
  console.log(
    `  ${result.name.padEnd(45)} ${opsColor}${result.opsPerSec.toLocaleString().padStart(10)} ops/sec${colors.reset}  (${result.avgMs.toFixed(4)}ms avg)`,
  );
}

function printSection(title: string) {
  console.log(`\n${colors.bold}${colors.blue}▶ ${title}${colors.reset}`);
}

async function runBenchmarks() {
  console.log(`${colors.bold}
╔══════════════════════════════════════════════════════════════╗
║            DB Bridge Query Builder Benchmarks                ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const mysqlCtx = createMockContext('mysql');
  const pgCtx = createMockContext('postgresql');

  // ==================== Simple Queries ====================
  printSection('Simple Queries');

  printResult(
    benchmark('SELECT * FROM table', () => {
      new SelectBuilder(mysqlCtx).from('users').toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with columns', () => {
      new SelectBuilder(mysqlCtx).select('id', 'name', 'email', 'created_at').from('users').toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with WHERE', () => {
      new SelectBuilder(mysqlCtx).from('users').where('id', 1).toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with multiple WHERE', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .where('active', true)
        .where('age', '>=', 18)
        .where('status', 'verified')
        .toSQL();
    }),
  );

  // ==================== Complex Queries ====================
  printSection('Complex Queries');

  printResult(
    benchmark('SELECT with JOIN', () => {
      new SelectBuilder(mysqlCtx)
        .from('orders')
        .join('users', 'orders.user_id = users.id')
        .select('orders.*', 'users.name')
        .toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with multiple JOINs', () => {
      new SelectBuilder(mysqlCtx)
        .from('order_items')
        .join('orders', 'order_items.order_id = orders.id')
        .join('products', 'order_items.product_id = products.id')
        .join('users', 'orders.user_id = users.id')
        .select('order_items.*', 'products.name', 'users.email')
        .toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with GROUP BY + HAVING', () => {
      new SelectBuilder(mysqlCtx)
        .select('category', 'COUNT(*) as count', 'SUM(price) as total')
        .from('products')
        .groupBy('category')
        .having('COUNT(*) > ?', [10])
        .toSQL();
    }),
  );

  printResult(
    benchmark('SELECT with ORDER + LIMIT + OFFSET', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .orderBy('created_at', 'DESC')
        .orderBy('name', 'ASC')
        .limit(20)
        .offset(40)
        .toSQL();
    }),
  );

  // ==================== WHERE Variations ====================
  printSection('WHERE Clause Variations');

  printResult(
    benchmark('WHERE IN (5 values)', () => {
      new SelectBuilder(mysqlCtx).from('users').whereIn('id', [1, 2, 3, 4, 5]).toSQL();
    }),
  );

  printResult(
    benchmark('WHERE IN (20 values)', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .whereIn(
          'id',
          Array.from({ length: 20 }, (_, i) => i + 1),
        )
        .toSQL();
    }),
  );

  printResult(
    benchmark('WHERE BETWEEN', () => {
      new SelectBuilder(mysqlCtx).from('products').whereBetween('price', 100, 500).toSQL();
    }),
  );

  printResult(
    benchmark('WHERE LIKE', () => {
      new SelectBuilder(mysqlCtx).from('users').whereLike('name', '%john%').toSQL();
    }),
  );

  printResult(
    benchmark('WHERE NULL + NOT NULL', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .whereNull('deleted_at')
        .whereNotNull('email_verified_at')
        .toSQL();
    }),
  );

  printResult(
    benchmark('Complex WHERE (AND + OR)', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .where('active', true)
        .where('age', '>=', 18)
        .orWhere('vip', true)
        .orWhere('admin', true)
        .toSQL();
    }),
  );

  // ==================== Full Query ====================
  printSection('Full Complex Query');

  printResult(
    benchmark('Complex query (all features)', () => {
      new SelectBuilder(mysqlCtx)
        .select(
          'u.id',
          'u.name',
          'u.email',
          'COUNT(o.id) as order_count',
          'SUM(o.total) as total_spent',
        )
        .from('users', 'u')
        .leftJoin('orders o', 'u.id = o.user_id')
        .where('u.active', true)
        .where('u.created_at', '>=', '2024-01-01')
        .whereNotNull('u.email_verified_at')
        .groupBy('u.id', 'u.name', 'u.email')
        .having('COUNT(o.id) > ?', [5])
        .orderBy('total_spent', 'DESC')
        .limit(50)
        .offset(0)
        .toSQL();
    }),
  );

  // ==================== Dialect Comparison ====================
  printSection('Dialect Comparison');

  printResult(
    benchmark('MySQL Dialect', () => {
      new SelectBuilder(mysqlCtx)
        .from('users')
        .where('status', 'active')
        .where('age', '>', 18)
        .orderBy('name')
        .limit(10)
        .toSQL();
    }),
  );

  printResult(
    benchmark('PostgreSQL Dialect', () => {
      new SelectBuilder(pgCtx)
        .from('users')
        .where('status', 'active')
        .where('age', '>', 18)
        .orderBy('name')
        .limit(10)
        .toSQL();
    }),
  );

  // ==================== Builder Operations ====================
  printSection('Builder Operations');

  printResult(
    benchmark('clone()', () => {
      const base = new SelectBuilder(mysqlCtx).from('users').where('active', true);
      base.clone();
    }),
  );

  printResult(
    benchmark('clone() + modify', () => {
      const base = new SelectBuilder(mysqlCtx).from('users').where('active', true);
      base.clone().where('role', 'admin').toSQL();
    }),
  );

  console.log(`
${colors.bold}${colors.green}✓ Benchmarks completed${colors.reset}
`);
}

runBenchmarks().catch(console.error);
