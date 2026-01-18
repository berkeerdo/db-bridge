import { describe, it, expect, vi } from 'vitest';

import { ModularPerformanceMonitor } from '../modular-performance-monitor';

import type { DatabaseAdapter } from '../../interfaces';

describe('ModularPerformanceMonitor', () => {
  const createMockAdapter = (): DatabaseAdapter =>
    ({
      name: 'PostgreSQL',
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      isConnected: true,
      getPoolStats: vi.fn().mockReturnValue({ total: 10, active: 2, idle: 8, waiting: 0 }),
    }) as unknown as DatabaseAdapter;

  describe('constructor', () => {
    it('should create with default options', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter);

      expect(monitor.isEnabled()).toBe(true);
    });

    it('should create with custom slowQueryThreshold', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter, {
        slowQueryThreshold: 500,
      });

      expect(monitor.isEnabled()).toBe(true);
    });

    it('should create with custom maxTraces', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter, {
        maxTraces: 5000,
      });

      expect(monitor.isEnabled()).toBe(true);
    });

    it('should create with enabled=false', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter, {
        enabled: false,
      });

      expect(monitor.isEnabled()).toBe(false);
    });

    it('should create with all options', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter, {
        slowQueryThreshold: 2000,
        maxTraces: 1000,
        enabled: true,
      });

      expect(monitor.isEnabled()).toBe(true);
    });
  });

  describe('inherited methods', () => {
    it('should have wrapAdapter method from trait', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter);

      expect(typeof monitor.wrapAdapter).toBe('function');
    });

    it('should have startTrace method from trait', () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter);

      const id = monitor.startTrace('test', {});
      expect(id).toBeTruthy();
    });

    it('should have analyzePerformance method from trait', async () => {
      const adapter = createMockAdapter();
      const monitor = new ModularPerformanceMonitor(adapter);

      const report = await monitor.analyzePerformance();
      expect(report).toHaveProperty('slowQueries');
      expect(report).toHaveProperty('recommendations');
    });
  });
});
