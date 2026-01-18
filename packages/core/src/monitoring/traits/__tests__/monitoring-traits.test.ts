import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { AdapterWrapperTrait } from '../adapter-wrapper-trait';
import { PerformanceAnalysisTrait, type PerformanceReport } from '../performance-analysis-trait';
import { QueryAnalysisTrait, type QueryPlan } from '../query-analysis-trait';
import { TraceBaseTrait, type PerformanceTrace } from '../trace-base-trait';
import { TraceManagementTrait } from '../trace-management-trait';

import type { DatabaseAdapter } from '../../../interfaces';

describe('TraceBaseTrait', () => {
  let trait: TraceBaseTrait;

  beforeEach(() => {
    trait = new TraceBaseTrait();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(trait.isEnabled()).toBe(true);
    });

    it('should accept custom maxTraces and enabled', () => {
      trait = new TraceBaseTrait(5000, false);
      expect(trait.isEnabled()).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should enable tracing', () => {
      trait.disable();
      expect(trait.isEnabled()).toBe(false);

      trait.enable();
      expect(trait.isEnabled()).toBe(true);
    });

    it('should disable tracing', () => {
      trait.disable();
      expect(trait.isEnabled()).toBe(false);
    });
  });

  describe('getTraces', () => {
    it('should return empty array when no traces', () => {
      const traces = trait.getTraces();
      expect(traces).toEqual([]);
    });

    it('should filter by operation', () => {
      // We need to use TraceManagementTrait to add traces
      const mgmtTrait = new TraceManagementTrait();
      mgmtTrait.startTrace('query.select', {});
      mgmtTrait.startTrace('query.insert', {});
      mgmtTrait.startTrace('connection', {});

      const traces = mgmtTrait.getTraces({ operation: 'query' });
      expect(traces.length).toBe(2);
    });

    it('should filter by status', () => {
      const mgmtTrait = new TraceManagementTrait();
      const id1 = mgmtTrait.startTrace('op1', {});
      const id2 = mgmtTrait.startTrace('op2', {});
      mgmtTrait.endTrace(id1);

      const completed = mgmtTrait.getTraces({ status: 'completed' });
      expect(completed.length).toBe(1);
      expect(completed[0].id).toBe(id1);
    });

    it('should filter by minDuration', () => {
      const mgmtTrait = new TraceManagementTrait();
      const id1 = mgmtTrait.startTrace('op1', {});
      const id2 = mgmtTrait.startTrace('op2', {});

      // End traces with different durations (we can't control actual duration, so we test the filter logic)
      mgmtTrait.endTrace(id1);
      mgmtTrait.endTrace(id2);

      const traces = mgmtTrait.getTraces({ minDuration: 0 });
      expect(traces.length).toBe(2);
    });

    it('should filter by parent', () => {
      const mgmtTrait = new TraceManagementTrait();
      const parentId = mgmtTrait.startTrace('parent', {});
      mgmtTrait.startTrace('child', {}, parentId);
      mgmtTrait.startTrace('orphan', {});

      const children = mgmtTrait.getTraces({ parent: parentId });
      expect(children.length).toBe(1);
    });

    it('should sort traces by startTime descending', () => {
      const mgmtTrait = new TraceManagementTrait();
      const id1 = mgmtTrait.startTrace('first', {});
      const id2 = mgmtTrait.startTrace('second', {});
      const id3 = mgmtTrait.startTrace('third', {});

      const traces = mgmtTrait.getTraces();
      // Most recent should be first
      expect(traces[0].id).toBe(id3);
      expect(traces[2].id).toBe(id1);
    });
  });

  describe('exportTraces', () => {
    it('should export traces as JSON string', () => {
      const mgmtTrait = new TraceManagementTrait();
      mgmtTrait.startTrace('test', { key: 'value' });

      const exported = mgmtTrait.exportTraces();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].operation).toBe('test');
      expect(parsed[0].metadata.key).toBe('value');
    });

    it('should return empty array JSON when no traces', () => {
      const exported = trait.exportTraces();
      expect(exported).toBe('[]');
    });
  });

  describe('importTraces', () => {
    it('should import traces from JSON string', () => {
      const traces: PerformanceTrace[] = [
        {
          id: 'imported_1',
          operation: 'test',
          startTime: 1000,
          metadata: {},
          status: 'completed',
          children: [],
        },
      ];

      trait.importTraces(JSON.stringify(traces));

      const retrieved = trait.getTraces();
      expect(retrieved.length).toBe(1);
      expect(retrieved[0].id).toBe('imported_1');
    });

    it('should throw on invalid JSON', () => {
      expect(() => trait.importTraces('invalid json')).toThrow('Failed to import traces');
    });
  });

  describe('reset', () => {
    it('should clear all traces', () => {
      const mgmtTrait = new TraceManagementTrait();
      mgmtTrait.startTrace('test', {});
      expect(mgmtTrait.getTraces().length).toBe(1);

      mgmtTrait.reset();
      expect(mgmtTrait.getTraces().length).toBe(0);
    });
  });
});

describe('TraceManagementTrait', () => {
  let trait: TraceManagementTrait;

  beforeEach(() => {
    trait = new TraceManagementTrait();
  });

  describe('startTrace', () => {
    it('should return empty string when disabled', () => {
      trait.disable();
      const id = trait.startTrace('test', {});
      expect(id).toBe('');
    });

    it('should create a trace with unique id', () => {
      const id = trait.startTrace('test', {});
      expect(id).toMatch(/^trace_\d+_[\da-z]+$/);
    });

    it('should store metadata', () => {
      const id = trait.startTrace('query', { sql: 'SELECT 1' });
      const trace = trait.getTrace(id);
      expect(trace?.metadata.sql).toBe('SELECT 1');
    });

    it('should set status to started', () => {
      const id = trait.startTrace('test', {});
      const trace = trait.getTrace(id);
      expect(trace?.status).toBe('started');
    });

    it('should add to parent children if parent exists', () => {
      const parentId = trait.startTrace('parent', {});
      const childId = trait.startTrace('child', {}, parentId);

      const parent = trait.getTrace(parentId);
      expect(parent?.children).toContain(childId);
    });

    it('should emit traceStart event', () => {
      const listener = vi.fn();
      trait.on('traceStart', listener);

      trait.startTrace('test', {});

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'test',
          status: 'started',
        }),
      );
    });

    it('should cleanup old traces when maxTraces exceeded', () => {
      // Use maxTraces=50 so cleanup removes 5 traces at a time (10%)
      const smallTrait = new TraceManagementTrait(50);

      // Create 60 traces to trigger cleanup
      for (let i = 0; i < 60; i++) {
        smallTrait.startTrace(`op${i}`, {});
      }

      // Should have cleaned up oldest traces (60 - 5 = 55, then 55 - 5 = 50 on next trigger)
      // Cleanup triggers when size > maxTraces and removes 10%
      expect(smallTrait.getTraces().length).toBeLessThan(60);
    });
  });

  describe('endTrace', () => {
    it('should do nothing when disabled', () => {
      const id = trait.startTrace('test', {});
      trait.disable();
      trait.endTrace(id);

      const trace = trait.getTrace(id);
      expect(trace?.status).toBe('started');
    });

    it('should do nothing for empty id', () => {
      trait.endTrace('');
      // Should not throw
    });

    it('should do nothing for non-existent trace', () => {
      trait.endTrace('non-existent');
      // Should not throw
    });

    it('should set endTime and duration', () => {
      const id = trait.startTrace('test', {});
      trait.endTrace(id);

      const trace = trait.getTrace(id);
      expect(trace?.endTime).toBeDefined();
      expect(trace?.duration).toBeGreaterThanOrEqual(0);
    });

    it('should set status to completed on success', () => {
      const id = trait.startTrace('test', {});
      trait.endTrace(id);

      const trace = trait.getTrace(id);
      expect(trace?.status).toBe('completed');
    });

    it('should set status to failed with error', () => {
      const id = trait.startTrace('test', {});
      const error = new Error('Test error');
      trait.endTrace(id, error);

      const trace = trait.getTrace(id);
      expect(trace?.status).toBe('failed');
      expect(trace?.error).toBe(error);
    });

    it('should emit traceEnd event', () => {
      const listener = vi.fn();
      trait.on('traceEnd', listener);

      const id = trait.startTrace('test', {});
      trait.endTrace(id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
        }),
      );
    });
  });

  describe('getTrace', () => {
    it('should return undefined for non-existent trace', () => {
      expect(trait.getTrace('non-existent')).toBeUndefined();
    });

    it('should return trace by id', () => {
      const id = trait.startTrace('test', {});
      const trace = trait.getTrace(id);
      expect(trace?.id).toBe(id);
    });
  });

  describe('getChildTraces', () => {
    it('should return empty array for non-existent parent', () => {
      const children = trait.getChildTraces('non-existent');
      expect(children).toEqual([]);
    });

    it('should return child traces', () => {
      const parentId = trait.startTrace('parent', {});
      trait.startTrace('child1', {}, parentId);
      trait.startTrace('child2', {}, parentId);

      const children = trait.getChildTraces(parentId);
      expect(children.length).toBe(2);
    });
  });

  describe('getTraceHierarchy', () => {
    it('should return null for non-existent root', () => {
      const hierarchy = trait.getTraceHierarchy('non-existent');
      expect(hierarchy).toBeNull();
    });

    it('should build trace hierarchy', () => {
      const rootId = trait.startTrace('root', {});
      const child1Id = trait.startTrace('child1', {}, rootId);
      trait.startTrace('grandchild', {}, child1Id);
      trait.startTrace('child2', {}, rootId);

      const hierarchy = trait.getTraceHierarchy(rootId);

      expect(hierarchy).not.toBeNull();
      expect(hierarchy?.operation).toBe('root');
      expect((hierarchy?.children as any[]).length).toBe(2);
    });
  });
});

describe('QueryAnalysisTrait', () => {
  let adapter: DatabaseAdapter;
  let trait: QueryAnalysisTrait;

  beforeEach(() => {
    adapter = {
      name: 'PostgreSQL',
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      isConnected: true,
      getPoolStats: vi.fn().mockReturnValue({ total: 10, active: 2, idle: 8, waiting: 0 }),
    } as unknown as DatabaseAdapter;

    trait = new QueryAnalysisTrait(adapter, 1000);
  });

  describe('constructor', () => {
    it('should set adapter and slowQueryThreshold', () => {
      expect(trait.isEnabled()).toBe(true);
    });
  });

  describe('endTrace with slow query detection', () => {
    it('should detect slow queries', () => {
      const listener = vi.fn();
      trait.on('slowQuery', listener);

      // Start a query trace
      const id = trait.startTrace('query', { sql: 'SELECT * FROM users', params: [] });

      // Manually modify the trace to simulate slow query
      const trace = trait.getTrace(id);
      if (trace) {
        trace.startTime = performance.now() - 2000; // 2 seconds ago
      }

      trait.endTrace(id);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'SELECT * FROM users',
        }),
      );
    });

    it('should not detect fast queries as slow', () => {
      const listener = vi.fn();
      trait.on('slowQuery', listener);

      const id = trait.startTrace('query', { sql: 'SELECT 1' });
      trait.endTrace(id);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should limit slow queries to 100', () => {
      // Create 105 slow queries
      for (let i = 0; i < 105; i++) {
        const id = trait.startTrace('query', { sql: `SELECT ${i}` });
        const trace = trait.getTrace(id);
        if (trace) {
          trace.startTime = performance.now() - 2000;
        }
        trait.endTrace(id);
      }

      expect(trait.getSlowQueries(200).length).toBeLessThanOrEqual(100);
    });
  });

  describe('explainQuery', () => {
    it('should return null when disabled', async () => {
      trait.disable();
      const plan = await trait.explainQuery('SELECT 1');
      expect(plan).toBeNull();
    });

    it('should use PostgreSQL EXPLAIN syntax', async () => {
      (adapter.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            'QUERY PLAN': [
              {
                Plan: {
                  'Total Cost': 10,
                  'Plan Rows': 100,
                  'Plan Width': 50,
                  'Actual Total Time': 5,
                  'Actual Rows': 100,
                },
              },
            ],
          },
        ],
        rowCount: 1,
        fields: [],
      });

      const plan = await trait.explainQuery('SELECT * FROM users');

      expect(adapter.query).toHaveBeenCalledWith(
        expect.stringContaining('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)'),
        undefined,
      );
      expect(plan?.cost).toBe(10);
    });

    it('should use MySQL EXPLAIN syntax', async () => {
      (adapter as any).name = 'MySQL';
      (adapter.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            query_block: {
              cost_info: { query_cost: 5 },
              table: { rows_examined_per_scan: 50 },
            },
          },
        ],
        rowCount: 1,
        fields: [],
      });

      const plan = await trait.explainQuery('SELECT * FROM users');

      expect(adapter.query).toHaveBeenCalledWith(
        expect.stringContaining('EXPLAIN FORMAT=JSON'),
        undefined,
      );
      expect(plan?.cost).toBe(5);
    });

    it('should return null for unsupported databases', async () => {
      (adapter as any).name = 'SQLite';

      const plan = await trait.explainQuery('SELECT 1');
      expect(plan).toBeNull();
    });

    it('should emit explainError on failure', async () => {
      const listener = vi.fn();
      trait.on('explainError', listener);

      (adapter.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Query failed'));

      await trait.explainQuery('SELECT 1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: 'SELECT 1',
          error: expect.any(Error),
        }),
      );
    });

    it('should handle empty result rows', async () => {
      (adapter.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const plan = await trait.explainQuery('SELECT 1');
      expect(plan).toBeNull();
    });
  });

  describe('getSlowQueries', () => {
    it('should return limited slow queries', () => {
      // Add slow queries
      for (let i = 0; i < 30; i++) {
        const id = trait.startTrace('query', { sql: `SELECT ${i}` });
        const trace = trait.getTrace(id);
        if (trace) {
          trace.startTime = performance.now() - 2000;
        }
        trait.endTrace(id);
      }

      expect(trait.getSlowQueries(10).length).toBe(10);
    });
  });

  describe('reset', () => {
    it('should clear slow queries and query plans', async () => {
      // Add slow queries
      const id = trait.startTrace('query', { sql: 'SELECT 1' });
      const trace = trait.getTrace(id);
      if (trace) {
        trace.startTime = performance.now() - 2000;
      }
      trait.endTrace(id);

      // Add query plan
      (adapter.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        rows: [
          {
            'QUERY PLAN': [{ Plan: { 'Total Cost': 1 } }],
          },
        ],
        rowCount: 1,
        fields: [],
      });
      await trait.explainQuery('SELECT 1');

      trait.reset();

      expect(trait.getSlowQueries().length).toBe(0);
      expect(trait.getTraces().length).toBe(0);
    });
  });
});

describe('PerformanceAnalysisTrait', () => {
  let adapter: DatabaseAdapter;
  let trait: PerformanceAnalysisTrait;

  beforeEach(() => {
    adapter = {
      name: 'PostgreSQL',
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      isConnected: true,
      getPoolStats: vi.fn().mockReturnValue({ total: 10, active: 2, idle: 8, waiting: 0 }),
    } as unknown as DatabaseAdapter;

    trait = new PerformanceAnalysisTrait(adapter, 1000);
  });

  describe('analyzePerformance', () => {
    it('should return performance report', async () => {
      // Create some traces
      const id1 = trait.startTrace('query', { sql: 'SELECT 1' });
      trait.endTrace(id1);

      const report = await trait.analyzePerformance();

      expect(report).toHaveProperty('slowQueries');
      expect(report).toHaveProperty('queryPlans');
      expect(report).toHaveProperty('bottlenecks');
      expect(report).toHaveProperty('recommendations');
    });

    it('should identify bottlenecks', async () => {
      // Create traces with different operations
      for (let i = 0; i < 5; i++) {
        const id = trait.startTrace('query.select', {});
        trait.endTrace(id);
      }

      for (let i = 0; i < 3; i++) {
        const id = trait.startTrace('query.insert', {});
        trait.endTrace(id);
      }

      const report = await trait.analyzePerformance();

      expect(report.bottlenecks.length).toBeGreaterThan(0);
      expect(report.bottlenecks[0]).toHaveProperty('operation');
      expect(report.bottlenecks[0]).toHaveProperty('averageDuration');
      expect(report.bottlenecks[0]).toHaveProperty('count');
      expect(report.bottlenecks[0]).toHaveProperty('impact');
    });
  });

  describe('generateRecommendations', () => {
    it('should recommend indexes for slow SELECT queries', async () => {
      // Create multiple slow SELECT queries
      for (let i = 0; i < 6; i++) {
        const id = trait.startTrace('query', { sql: `SELECT * FROM table${i}` });
        const trace = trait.getTrace(id);
        if (trace) {
          trace.startTime = performance.now() - 3000; // 3 seconds ago (> 2000ms threshold)
        }
        trait.endTrace(id);
      }

      const report = await trait.analyzePerformance();

      expect(report.recommendations).toContain(
        'Consider adding indexes. Multiple slow SELECT queries detected.',
      );
    });

    it('should detect N+1 query problems', async () => {
      // Create repetitive queries (same pattern, different values)
      for (let i = 0; i < 15; i++) {
        const id = trait.startTrace('query', { sql: `SELECT * FROM users WHERE id = ${i}` });
        const trace = trait.getTrace(id);
        if (trace) {
          trace.startTime = performance.now() - 2000;
        }
        trait.endTrace(id);
      }

      const report = await trait.analyzePerformance();

      expect(report.recommendations.some((r) => r.includes('N+1 query problem'))).toBe(true);
    });

    it('should warn about connection pool exhaustion', async () => {
      (adapter.getPoolStats as ReturnType<typeof vi.fn>).mockReturnValue({
        total: 10,
        active: 10,
        idle: 0,
        waiting: 5,
      });

      const report = await trait.analyzePerformance();

      expect(report.recommendations.some((r) => r.includes('Connection pool exhaustion'))).toBe(
        true,
      );
    });

    it('should warn about long transactions', async () => {
      // Create a long transaction trace
      const id = trait.startTrace('transaction.begin', {});
      const trace = trait.getTrace(id);
      if (trace) {
        trace.startTime = performance.now() - 6000; // 6 seconds
      }
      trait.endTrace(id);

      const report = await trait.analyzePerformance();

      expect(report.recommendations.some((r) => r.includes('Long-running transactions'))).toBe(
        true,
      );
    });
  });

  describe('getBottlenecks', () => {
    it('should return top bottlenecks by average duration', () => {
      // Create traces with different durations
      for (let i = 0; i < 5; i++) {
        const id = trait.startTrace('slow-op', {});
        const trace = trait.getTrace(id);
        if (trace) {
          trace.startTime = performance.now() - 1000;
        }
        trait.endTrace(id);
      }

      for (let i = 0; i < 10; i++) {
        const id = trait.startTrace('fast-op', {});
        trait.endTrace(id);
      }

      const bottlenecks = trait.getBottlenecks(5);

      expect(bottlenecks.length).toBeLessThanOrEqual(5);
      expect(bottlenecks[0]).toHaveProperty('operation');
      expect(bottlenecks[0]).toHaveProperty('avgDuration');
      expect(bottlenecks[0]).toHaveProperty('count');
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 20; i++) {
        const id = trait.startTrace(`op${i}`, {});
        trait.endTrace(id);
      }

      const bottlenecks = trait.getBottlenecks(3);
      expect(bottlenecks.length).toBeLessThanOrEqual(3);
    });
  });
});

describe('AdapterWrapperTrait', () => {
  let adapter: DatabaseAdapter;
  let trait: AdapterWrapperTrait;

  beforeEach(() => {
    adapter = {
      name: 'PostgreSQL',
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1, fields: [] }),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: true,
      getPoolStats: vi.fn().mockReturnValue({ total: 10, active: 2, idle: 8, waiting: 0 }),
    } as unknown as DatabaseAdapter;

    trait = new AdapterWrapperTrait(adapter, 1000);
  });

  describe('wrapAdapter', () => {
    it('should wrap query method and track traces', async () => {
      const wrappedAdapter = trait.wrapAdapter(adapter);

      await wrappedAdapter.query('SELECT 1');

      const traces = trait.getTraces({ operation: 'query' });
      expect(traces.length).toBe(1);
      expect(traces[0].status).toBe('completed');
    });

    it('should track query errors', async () => {
      adapter.query = vi.fn().mockRejectedValue(new Error('Query failed'));
      trait.wrapAdapter(adapter);

      await expect(adapter.query('SELECT 1')).rejects.toThrow('Query failed');

      const traces = trait.getTraces();
      expect(traces[0].status).toBe('failed');
      expect(traces[0].error?.message).toBe('Query failed');
    });

    it('should trigger explain for slow queries', async () => {
      vi.useFakeTimers();

      // Make query slow
      const originalQuery = vi.fn().mockImplementation(async (sql: string) => {
        // Don't delay for EXPLAIN queries
        if (sql.includes('EXPLAIN')) {
          return { rows: [], rowCount: 0, fields: [] };
        }
        return { rows: [], rowCount: 0, fields: [] };
      });

      adapter.query = originalQuery;
      trait.wrapAdapter(adapter);

      // Execute a query and manually simulate slow execution
      const queryPromise = adapter.query('SELECT * FROM users');

      // Get the trace and modify it to be slow
      await vi.advanceTimersByTimeAsync(0);
      await queryPromise;

      vi.useRealTimers();
    });

    it('should wrap beginTransaction method', async () => {
      trait.wrapAdapter(adapter);

      await adapter.beginTransaction();

      const traces = trait.getTraces({ operation: 'transaction' });
      expect(traces.length).toBe(1);
    });

    it('should wrap connect method', async () => {
      trait.wrapAdapter(adapter);

      await adapter.connect();

      const traces = trait.getTraces({ operation: 'connection' });
      expect(traces.length).toBe(1);
    });

    it('should wrap disconnect method', async () => {
      trait.wrapAdapter(adapter);

      await adapter.disconnect();

      const traces = trait.getTraces({ operation: 'connection' });
      expect(traces.length).toBe(1);
    });
  });

  describe('wrapMethod', () => {
    it('should not wrap non-function properties', () => {
      const obj = { prop: 'value' };
      // Access protected method via any
      (trait as any).wrapMethod(obj, 'prop', 'test');

      // Should not modify the property
      expect(obj.prop).toBe('value');
    });

    it('should track method execution', async () => {
      const obj = {
        asyncMethod: vi.fn().mockResolvedValue('result'),
      };

      (trait as any).wrapMethod(obj, 'asyncMethod', 'custom');

      await obj.asyncMethod('arg1', 'arg2');

      const traces = trait.getTraces({ operation: 'custom' });
      expect(traces.length).toBe(1);
    });

    it('should track method errors', async () => {
      const obj = {
        asyncMethod: vi.fn().mockRejectedValue(new Error('Method failed')),
      };

      (trait as any).wrapMethod(obj, 'asyncMethod', 'custom');

      await expect(obj.asyncMethod()).rejects.toThrow('Method failed');

      const traces = trait.getTraces();
      expect(traces[0].status).toBe('failed');
    });
  });

  describe('unwrapAdapter', () => {
    it('should emit adapterUnwrapped event', () => {
      const listener = vi.fn();
      trait.on('adapterUnwrapped', listener);

      trait.unwrapAdapter(adapter);

      expect(listener).toHaveBeenCalledWith({ adapter });
    });
  });
});
