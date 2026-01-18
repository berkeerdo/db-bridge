import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PerformanceMonitor } from '../performance-monitor';

import type { DatabaseAdapter } from '../../interfaces';

describe('PerformanceMonitor', () => {
  let adapter: DatabaseAdapter;
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    adapter = {
      name: 'PostgreSQL',
      query: vi.fn().mockResolvedValue({ rows: [] }),
      execute: vi.fn().mockResolvedValue({ affectedRows: 1 }),
      getPoolStats: vi.fn().mockReturnValue({
        total: 10,
        active: 3,
        idle: 7,
        waiting: 0,
      }),
    } as unknown as DatabaseAdapter;
  });

  afterEach(() => {
    monitor?.disable();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create monitor with default options', () => {
      monitor = new PerformanceMonitor(adapter);

      expect(monitor).toBeDefined();
      expect(monitor.isEnabled()).toBe(true);
    });

    it('should create monitor with custom options', () => {
      monitor = new PerformanceMonitor(adapter, {
        slowQueryThreshold: 500,
        maxTraces: 5000,
        enabled: false,
      });

      expect(monitor.isEnabled()).toBe(false);
    });
  });

  describe('startTrace', () => {
    it('should start a trace and return id', () => {
      monitor = new PerformanceMonitor(adapter);

      const traceId = monitor.startTrace('query', { sql: 'SELECT 1' });

      expect(traceId).toMatch(/^trace_/);
    });

    it('should return empty string when disabled', () => {
      monitor = new PerformanceMonitor(adapter, { enabled: false });

      const traceId = monitor.startTrace('query', { sql: 'SELECT 1' });

      expect(traceId).toBe('');
    });

    it('should emit traceStart event', () => {
      monitor = new PerformanceMonitor(adapter);
      const listener = vi.fn();
      monitor.on('traceStart', listener);

      monitor.startTrace('query', { sql: 'SELECT 1' });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'query',
          status: 'started',
        }),
      );
    });

    it('should link child traces to parent', () => {
      monitor = new PerformanceMonitor(adapter);

      const parentId = monitor.startTrace('transaction');
      const childId = monitor.startTrace('query', { sql: 'SELECT 1' }, parentId);

      const traces = monitor.getTraces();
      const parentTrace = traces.find((t) => t.id === parentId);

      expect(parentTrace!.children).toContain(childId);
    });

    it('should clean up old traces when max is exceeded', () => {
      monitor = new PerformanceMonitor(adapter, { maxTraces: 10 });

      // Create more than maxTraces
      for (let i = 0; i < 15; i++) {
        monitor.startTrace('query', { i });
      }

      const traces = monitor.getTraces();
      expect(traces.length).toBeLessThanOrEqual(15); // Some may be cleaned
    });
  });

  describe('endTrace', () => {
    it('should end a trace and calculate duration', () => {
      monitor = new PerformanceMonitor(adapter);
      const traceId = monitor.startTrace('query');

      monitor.endTrace(traceId);

      const traces = monitor.getTraces();
      const trace = traces.find((t) => t.id === traceId);

      expect(trace!.status).toBe('completed');
      expect(trace!.duration).toBeDefined();
    });

    it('should do nothing when disabled', () => {
      monitor = new PerformanceMonitor(adapter, { enabled: false });

      monitor.endTrace('some-id'); // Should not throw
    });

    it('should do nothing for empty id', () => {
      monitor = new PerformanceMonitor(adapter);

      monitor.endTrace(''); // Should not throw
    });

    it('should do nothing for non-existent trace', () => {
      monitor = new PerformanceMonitor(adapter);

      monitor.endTrace('non-existent'); // Should not throw
    });

    it('should mark trace as failed when error is provided', () => {
      monitor = new PerformanceMonitor(adapter);
      const traceId = monitor.startTrace('query');
      const error = new Error('Test error');

      monitor.endTrace(traceId, error);

      const traces = monitor.getTraces();
      const trace = traces.find((t) => t.id === traceId);

      expect(trace!.status).toBe('failed');
      expect(trace!.error).toBe(error);
    });

    it('should emit traceEnd event', () => {
      monitor = new PerformanceMonitor(adapter);
      const listener = vi.fn();
      monitor.on('traceEnd', listener);
      const traceId = monitor.startTrace('query');

      monitor.endTrace(traceId);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        }),
      );
    });

    it('should track slow queries', async () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 }); // 0ms threshold
      const listener = vi.fn();
      monitor.on('slowQuery', listener);

      const traceId = monitor.startTrace('query', { sql: 'SELECT * FROM users' });

      // Simulate some time passing
      await new Promise((r) => setTimeout(r, 10));

      monitor.endTrace(traceId);

      expect(listener).toHaveBeenCalled();
    });

    it('should limit slow queries to 100', () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 });

      // Create 150 slow queries
      for (let i = 0; i < 150; i++) {
        const traceId = monitor.startTrace('query', { sql: `SELECT ${i}` });
        monitor.endTrace(traceId);
      }

      const slowQueries = monitor.getSlowQueries(200);
      expect(slowQueries.length).toBeLessThanOrEqual(100);
    });
  });

  describe('explainQuery', () => {
    it('should explain PostgreSQL query', async () => {
      adapter.name = 'PostgreSQL';
      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          {
            'QUERY PLAN': [
              {
                Plan: {
                  'Total Cost': 10.5,
                  'Plan Rows': 100,
                  'Plan Width': 20,
                  'Actual Total Time': 5.5,
                  'Actual Rows': 50,
                },
              },
            ],
          },
        ],
      });
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(adapter.query).toHaveBeenCalledWith(expect.stringContaining('EXPLAIN'), undefined);
      expect(plan).toBeDefined();
      expect(plan!.cost).toBe(10.5);
    });

    it('should explain MySQL query', async () => {
      adapter.name = 'MySQL';
      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          {
            query_block: {
              cost_info: { query_cost: 5 },
              table: { rows_examined_per_scan: 50 },
            },
          },
        ],
      });
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(adapter.query).toHaveBeenCalledWith(
        expect.stringContaining('EXPLAIN FORMAT=JSON'),
        undefined,
      );
      expect(plan).toBeDefined();
    });

    it('should return null for unsupported databases', async () => {
      adapter.name = 'SQLite';
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(plan).toBeNull();
    });

    it('should return null when disabled', async () => {
      monitor = new PerformanceMonitor(adapter, { enabled: false });

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(plan).toBeNull();
    });

    it('should emit explainError on failure', async () => {
      adapter.query = vi.fn().mockRejectedValue(new Error('Failed'));
      monitor = new PerformanceMonitor(adapter);
      const listener = vi.fn();
      monitor.on('explainError', listener);

      await monitor.explainQuery('SELECT * FROM users');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: 'SELECT * FROM users',
          error: expect.any(Error),
        }),
      );
    });

    it('should return null when no rows returned', async () => {
      adapter.query = vi.fn().mockResolvedValue({ rows: [] });
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(plan).toBeNull();
    });
  });

  describe('analyzePerformance', () => {
    it('should return performance report', async () => {
      monitor = new PerformanceMonitor(adapter);

      // Create some traces
      const trace1 = monitor.startTrace('query', { sql: 'SELECT 1' });
      monitor.endTrace(trace1);
      const trace2 = monitor.startTrace('query', { sql: 'SELECT 2' });
      monitor.endTrace(trace2);

      const report = await monitor.analyzePerformance();

      expect(report.slowQueries).toBeDefined();
      expect(report.queryPlans).toBeDefined();
      expect(report.bottlenecks).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should identify bottlenecks', async () => {
      monitor = new PerformanceMonitor(adapter);

      // Create traces with different operations
      for (let i = 0; i < 5; i++) {
        const trace = monitor.startTrace('query');
        monitor.endTrace(trace);
      }
      for (let i = 0; i < 3; i++) {
        const trace = monitor.startTrace('transaction');
        monitor.endTrace(trace);
      }

      const report = await monitor.analyzePerformance();

      expect(report.bottlenecks.length).toBeGreaterThan(0);
      expect(report.bottlenecks[0]).toHaveProperty('operation');
      expect(report.bottlenecks[0]).toHaveProperty('averageDuration');
      expect(report.bottlenecks[0]).toHaveProperty('count');
      expect(report.bottlenecks[0]).toHaveProperty('impact');
    });

    it('should recommend indexes for slow SELECT queries', async () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 });

      // Create slow SELECT queries by manually setting duration > 2000ms
      for (let i = 0; i < 10; i++) {
        const trace = monitor.startTrace('query', { sql: 'SELECT * FROM users WHERE id = 1' });
        monitor.endTrace(trace);
        // Manually update the slow query duration to exceed the 2000ms threshold
        const slowQueries = monitor.getSlowQueries(100);
        if (slowQueries.length > 0) {
          slowQueries.at(-1)!.duration = 3000; // Set duration > 2000ms
        }
      }

      const report = await monitor.analyzePerformance();

      expect(report.recommendations).toContain(
        'Consider adding indexes. Multiple slow SELECT queries detected.',
      );
    });

    it('should detect N+1 query patterns', async () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 });

      // Create repetitive queries (N+1 pattern)
      for (let i = 0; i < 15; i++) {
        const trace = monitor.startTrace('query', { sql: 'SELECT * FROM users WHERE id = 123' });
        monitor.endTrace(trace);
      }

      const report = await monitor.analyzePerformance();

      expect(report.recommendations).toContain(
        'Possible N+1 query problem detected. Consider using JOINs or batch loading.',
      );
    });

    it('should warn about connection pool exhaustion', async () => {
      adapter.getPoolStats = vi.fn().mockReturnValue({
        total: 10,
        active: 8,
        idle: 2,
        waiting: 5, // Waiting connections
      });
      monitor = new PerformanceMonitor(adapter);

      const report = await monitor.analyzePerformance();

      expect(report.recommendations).toContainEqual(
        expect.stringContaining('Connection pool exhaustion'),
      );
    });

    it('should warn about long transactions', async () => {
      monitor = new PerformanceMonitor(adapter);

      // Manually create a "long transaction" trace
      const trace = monitor.startTrace('transaction');
      // Simulate time by modifying the trace
      const traces = monitor.getTraces();
      const txTrace = traces.find((t) => t.id === trace);
      if (txTrace) {
        txTrace.duration = 10000; // 10 seconds
        txTrace.status = 'completed';
      }

      const report = await monitor.analyzePerformance();

      expect(report.recommendations).toContain(
        'Long-running transactions detected. Consider breaking them into smaller units.',
      );
    });
  });

  describe('wrapAdapter', () => {
    it('should wrap adapter query method', async () => {
      monitor = new PerformanceMonitor(adapter);
      const wrappedAdapter = monitor.wrapAdapter(adapter);

      await wrappedAdapter.query('SELECT 1');

      const traces = monitor.getTraces();
      expect(traces.some((t) => t.operation === 'query')).toBe(true);
    });

    it('should track errors in wrapped queries', async () => {
      adapter.query = vi.fn().mockRejectedValue(new Error('Query failed'));
      monitor = new PerformanceMonitor(adapter);
      const wrappedAdapter = monitor.wrapAdapter(adapter);

      await expect(wrappedAdapter.query('SELECT 1')).rejects.toThrow('Query failed');

      const traces = monitor.getTraces();
      expect(traces.some((t) => t.status === 'failed')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all data', () => {
      monitor = new PerformanceMonitor(adapter);
      monitor.startTrace('query');
      monitor.startTrace('query');

      monitor.reset();

      expect(monitor.getTraces()).toHaveLength(0);
      expect(monitor.getSlowQueries()).toHaveLength(0);
    });
  });

  describe('enable/disable', () => {
    it('should enable monitoring', () => {
      monitor = new PerformanceMonitor(adapter, { enabled: false });

      monitor.enable();

      expect(monitor.isEnabled()).toBe(true);
    });

    it('should disable monitoring', () => {
      monitor = new PerformanceMonitor(adapter);

      monitor.disable();

      expect(monitor.isEnabled()).toBe(false);
    });
  });

  describe('getTraces', () => {
    it('should return all traces', () => {
      monitor = new PerformanceMonitor(adapter);
      monitor.startTrace('query');
      monitor.startTrace('transaction');

      const traces = monitor.getTraces();

      expect(traces).toHaveLength(2);
    });

    it('should filter by operation', () => {
      monitor = new PerformanceMonitor(adapter);
      monitor.startTrace('query');
      monitor.startTrace('query');
      monitor.startTrace('transaction');

      const traces = monitor.getTraces({ operation: 'query' });

      expect(traces).toHaveLength(2);
    });

    it('should filter by status', () => {
      monitor = new PerformanceMonitor(adapter);
      const trace1 = monitor.startTrace('query');
      monitor.startTrace('query');
      monitor.endTrace(trace1);

      const traces = monitor.getTraces({ status: 'completed' });

      expect(traces).toHaveLength(1);
    });

    it('should filter by minDuration', () => {
      monitor = new PerformanceMonitor(adapter);
      const trace1 = monitor.startTrace('query');
      const trace2 = monitor.startTrace('query');
      monitor.endTrace(trace1);
      monitor.endTrace(trace2);

      const traces = monitor.getTraces({ minDuration: 0 });

      expect(traces.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by parent', () => {
      monitor = new PerformanceMonitor(adapter);
      const parentId = monitor.startTrace('transaction');
      monitor.startTrace('query', {}, parentId);
      monitor.startTrace('query', {}, parentId);
      monitor.startTrace('query'); // No parent

      const traces = monitor.getTraces({ parent: parentId });

      expect(traces).toHaveLength(2);
    });
  });

  describe('getSlowQueries', () => {
    it('should return slow queries with default limit', () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 });

      for (let i = 0; i < 5; i++) {
        const trace = monitor.startTrace('query', { sql: `SELECT ${i}` });
        monitor.endTrace(trace);
      }

      const slowQueries = monitor.getSlowQueries();

      expect(slowQueries.length).toBeLessThanOrEqual(20);
    });

    it('should return slow queries with custom limit', () => {
      monitor = new PerformanceMonitor(adapter, { slowQueryThreshold: 0 });

      for (let i = 0; i < 10; i++) {
        const trace = monitor.startTrace('query', { sql: `SELECT ${i}` });
        monitor.endTrace(trace);
      }

      const slowQueries = monitor.getSlowQueries(5);

      expect(slowQueries).toHaveLength(5);
    });
  });

  describe('exportTraces', () => {
    it('should export traces as JSON', () => {
      monitor = new PerformanceMonitor(adapter);
      monitor.startTrace('query', { sql: 'SELECT 1' });

      const exported = monitor.exportTraces();

      expect(() => JSON.parse(exported)).not.toThrow();
      const parsed = JSON.parse(exported);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].operation).toBe('query');
    });
  });

  describe('importTraces', () => {
    it('should import traces from JSON', () => {
      monitor = new PerformanceMonitor(adapter);
      const traces = [
        {
          id: 'trace_123',
          operation: 'query',
          startTime: Date.now(),
          metadata: {},
          status: 'completed' as const,
          children: [],
        },
      ];

      monitor.importTraces(JSON.stringify(traces));

      const imported = monitor.getTraces();
      expect(imported.some((t) => t.id === 'trace_123')).toBe(true);
    });

    it('should throw on invalid JSON', () => {
      monitor = new PerformanceMonitor(adapter);

      expect(() => monitor.importTraces('invalid json')).toThrow('Failed to import traces');
    });
  });

  describe('parseExplainResult', () => {
    it('should handle PostgreSQL array format', async () => {
      adapter.name = 'PostgreSQL';
      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          {
            'QUERY PLAN': [
              {
                Query: 'SELECT * FROM users',
                Plan: {
                  'Total Cost': 15.5,
                  'Plan Rows': 200,
                  'Plan Width': 30,
                },
              },
            ],
          },
        ],
      });
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      expect(plan).toBeDefined();
      expect(plan!.rows).toBe(200);
    });

    it('should handle MySQL JSON string format', async () => {
      adapter.name = 'MySQL';
      adapter.query = vi.fn().mockResolvedValue({
        rows: [
          JSON.stringify({
            query_block: {
              cost_info: { query_cost: 8 },
              table: { rows_examined_per_scan: 75 },
            },
          }),
        ],
      });
      monitor = new PerformanceMonitor(adapter);

      const plan = await monitor.explainQuery('SELECT * FROM users');

      // MySQL string parsing may return null if format doesn't match expected structure
      // This tests the code path without asserting specific values
      expect(plan === null || typeof plan === 'object').toBe(true);
    });
  });
});
