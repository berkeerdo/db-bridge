import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { MetricsCollector } from '../metrics-collector';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    vi.useFakeTimers();
    collector = new MetricsCollector();
  });

  afterEach(() => {
    collector.stop();
    vi.useRealTimers();
  });

  describe('recordQuery', () => {
    it('should record successful query', () => {
      collector.recordQuery('SELECT', 50, true);
      const snapshot = collector.getSnapshot();

      expect(snapshot.query.totalQueries).toBe(1);
      expect(snapshot.query.successfulQueries).toBe(1);
      expect(snapshot.query.failedQueries).toBe(0);
    });

    it('should record failed query', () => {
      collector.recordQuery('SELECT', 100, false);
      const snapshot = collector.getSnapshot();

      expect(snapshot.query.totalQueries).toBe(1);
      expect(snapshot.query.successfulQueries).toBe(0);
      expect(snapshot.query.failedQueries).toBe(1);
    });

    it('should update latency metrics', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('SELECT', 100, true);
      collector.recordQuery('SELECT', 25, true);

      const snapshot = collector.getSnapshot();

      expect(snapshot.query.minLatency).toBe(25);
      expect(snapshot.query.maxLatency).toBe(100);
      expect(snapshot.query.averageLatency).toBeCloseTo(58.33, 1);
    });

    it('should track slow queries', () => {
      collector = new MetricsCollector({ slowQueryThreshold: 100 });
      const slowQueryHandler = vi.fn();
      collector.on('slowQuery', slowQueryHandler);

      collector.recordQuery('SELECT', 50, true); // Not slow
      collector.recordQuery('SELECT', 150, true); // Slow

      const snapshot = collector.getSnapshot();
      expect(snapshot.query.slowQueries).toBe(1);
      expect(slowQueryHandler).toHaveBeenCalledWith({ command: 'SELECT', latency: 150 });
    });

    it('should track query distribution', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('INSERT', 30, true);
      collector.recordQuery('UPDATE', 40, true);

      const snapshot = collector.getSnapshot();

      expect(snapshot.query.queryDistribution).toEqual({
        SELECT: 2,
        INSERT: 1,
        UPDATE: 1,
      });
    });

    it('should calculate QPS', async () => {
      await vi.advanceTimersByTimeAsync(1000); // Advance 1 second

      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('SELECT', 50, true);

      const snapshot = collector.getSnapshot();
      expect(snapshot.query.queriesPerSecond).toBeCloseTo(2, 0);
    });

    it('should track cache hits', () => {
      collector.recordQuery('SELECT', 50, true, true); // Cache hit
      collector.recordQuery('SELECT', 50, true, false); // Cache miss

      const snapshot = collector.getSnapshot();
      expect(snapshot.query.cacheHitRate).toBe(0.5);
    });

    it('should limit latency history to 1000 entries', () => {
      for (let i = 0; i < 1100; i++) {
        collector.recordQuery('SELECT', i, true);
      }

      const snapshot = collector.getSnapshot();
      // Average should be of last 1000 entries (100-1099), not all 1100
      expect(snapshot.query.averageLatency).toBeGreaterThan(500);
    });
  });

  describe('recordConnection', () => {
    it('should record successful connection', () => {
      collector.recordConnection(true, 100);
      const snapshot = collector.getSnapshot();

      expect(snapshot.connection.totalConnections).toBe(1);
      expect(snapshot.connection.activeConnections).toBe(1);
      expect(snapshot.connection.averageConnectionTime).toBe(100);
    });

    it('should record failed connection', () => {
      collector.recordConnection(false);
      const snapshot = collector.getSnapshot();

      expect(snapshot.connection.totalConnections).toBe(1);
      expect(snapshot.connection.connectionErrors).toBe(1);
    });

    it('should calculate average connection time', () => {
      collector.recordConnection(true, 100);
      collector.recordConnection(true, 200);
      collector.recordConnection(true, 150);

      const snapshot = collector.getSnapshot();
      expect(snapshot.connection.averageConnectionTime).toBe(150);
    });

    it('should limit connection time history to 100 entries', () => {
      for (let i = 0; i < 150; i++) {
        collector.recordConnection(true, i);
      }

      const snapshot = collector.getSnapshot();
      // Average should be of last 100 entries (50-149)
      expect(snapshot.connection.averageConnectionTime).toBeGreaterThan(90);
    });
  });

  describe('recordTransaction', () => {
    it('should record transaction start', () => {
      collector.recordTransaction('start');
      const snapshot = collector.getSnapshot();

      expect(snapshot.transaction.totalTransactions).toBe(1);
      expect(snapshot.transaction.activeTransactions).toBe(1);
    });

    it('should record transaction commit', () => {
      collector.recordTransaction('start');
      collector.recordTransaction('commit', 500);
      const snapshot = collector.getSnapshot();

      expect(snapshot.transaction.committedTransactions).toBe(1);
      expect(snapshot.transaction.activeTransactions).toBe(0);
      expect(snapshot.transaction.averageTransactionDuration).toBe(500);
    });

    it('should record transaction rollback', () => {
      collector.recordTransaction('start');
      collector.recordTransaction('rollback', 300);
      const snapshot = collector.getSnapshot();

      expect(snapshot.transaction.rolledBackTransactions).toBe(1);
      expect(snapshot.transaction.activeTransactions).toBe(0);
    });

    it('should record deadlock', () => {
      const deadlockHandler = vi.fn();
      collector.on('deadlock', deadlockHandler);

      collector.recordTransaction('start');
      collector.recordTransaction('rollback', 100, true);

      const snapshot = collector.getSnapshot();
      expect(snapshot.transaction.deadlocks).toBe(1);
      expect(deadlockHandler).toHaveBeenCalled();
    });

    it('should not go below zero active transactions', () => {
      collector.recordTransaction('commit'); // No start
      const snapshot = collector.getSnapshot();

      expect(snapshot.transaction.activeTransactions).toBe(0);
    });
  });

  describe('updateConnectionPool', () => {
    it('should update pool statistics', () => {
      collector.updateConnectionPool({ total: 10, active: 3, idle: 7 });
      const snapshot = collector.getSnapshot();

      expect(snapshot.connection.activeConnections).toBe(3);
      expect(snapshot.connection.idleConnections).toBe(7);
    });

    it('should calculate connection reuse', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('SELECT', 50, true);
      collector.updateConnectionPool({ total: 2, active: 1, idle: 1 });

      const snapshot = collector.getSnapshot();
      expect(snapshot.connection.connectionReuse).toBe(1); // 2 queries / 2 total connections
    });
  });

  describe('custom metrics', () => {
    it('should set custom metric', () => {
      collector.setCustomMetric('customValue', 42);
      const snapshot = collector.getSnapshot();

      expect(snapshot.custom.customValue).toBe(42);
    });

    it('should increment custom metric', () => {
      collector.incrementCustomMetric('counter');
      collector.incrementCustomMetric('counter');
      collector.incrementCustomMetric('counter', 5);

      const snapshot = collector.getSnapshot();
      expect(snapshot.custom.counter).toBe(7);
    });
  });

  describe('getSnapshot', () => {
    it('should return complete metrics snapshot', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordConnection(true, 100);
      collector.recordTransaction('start');

      const snapshot = collector.getSnapshot();

      expect(snapshot).toHaveProperty('query');
      expect(snapshot).toHaveProperty('connection');
      expect(snapshot).toHaveProperty('transaction');
      expect(snapshot).toHaveProperty('system');
      expect(snapshot).toHaveProperty('custom');
      expect(snapshot.system).toHaveProperty('memoryUsage');
      expect(snapshot.system).toHaveProperty('cpuUsage');
      expect(snapshot.system).toHaveProperty('uptime');
      expect(snapshot.system).toHaveProperty('timestamp');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordConnection(true, 100);
      collector.recordTransaction('start');
      collector.setCustomMetric('test', 123);

      collector.reset();
      const snapshot = collector.getSnapshot();

      expect(snapshot.query.totalQueries).toBe(0);
      expect(snapshot.connection.totalConnections).toBe(0);
      expect(snapshot.transaction.totalTransactions).toBe(0);
      expect(snapshot.custom).toEqual({});
    });
  });

  describe('collection interval', () => {
    it('should emit metrics at intervals', async () => {
      collector = new MetricsCollector({ collectionInterval: 1000 });
      const metricsHandler = vi.fn();
      collector.on('metrics', metricsHandler);

      await vi.advanceTimersByTimeAsync(1000);
      expect(metricsHandler).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(metricsHandler).toHaveBeenCalledTimes(2);

      collector.stop();

      await vi.advanceTimersByTimeAsync(2000);
      expect(metricsHandler).toHaveBeenCalledTimes(2); // No more calls
    });
  });

  describe('exportPrometheus', () => {
    it('should export metrics in Prometheus format', () => {
      collector.recordQuery('SELECT', 50, true);
      collector.recordQuery('INSERT', 30, true);
      collector.recordTransaction('start');
      collector.recordTransaction('commit', 500);

      const output = collector.exportPrometheus();

      expect(output).toContain('# HELP db_queries_total');
      expect(output).toContain('# TYPE db_queries_total counter');
      expect(output).toContain('db_queries_total 2');
      expect(output).toContain('db_connections_active');
      expect(output).toContain('db_transactions_total{status="committed"} 1');
      expect(output).toContain('nodejs_heap_size_total_bytes');
    });
  });
});
