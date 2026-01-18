import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { HealthChecker } from '../health-checker';

import type { DatabaseAdapter } from '../../interfaces';

describe('HealthChecker', () => {
  let adapter: DatabaseAdapter;
  let logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let checker: HealthChecker;

  beforeEach(() => {
    vi.useFakeTimers();

    adapter = {
      ping: vi.fn().mockResolvedValue(true),
      isConnected: true,
      version: '14.0',
      getPoolStats: vi.fn().mockReturnValue({
        total: 10,
        active: 3,
        idle: 7,
        waiting: 0,
      }),
    } as unknown as DatabaseAdapter;

    logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
  });

  afterEach(() => {
    checker?.stop();
    vi.useRealTimers();
  });

  describe('check', () => {
    it('should return healthy status when ping succeeds', async () => {
      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('healthy');
      expect(result.latency).toBeGreaterThanOrEqual(0);
      expect(result.details.connectionPool).toBeDefined();
      expect(result.details.version).toBe('14.0');
    });

    it('should return degraded status when pool has waiting connections', async () => {
      adapter.getPoolStats = vi.fn().mockReturnValue({
        total: 10,
        active: 5,
        idle: 5,
        waiting: 2,
      });

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('degraded');
    });

    it('should return degraded status when pool usage > 80%', async () => {
      adapter.getPoolStats = vi.fn().mockReturnValue({
        total: 10,
        active: 9,
        idle: 1,
        waiting: 0,
      });

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('degraded');
    });

    it('should return unhealthy when not connected', async () => {
      (adapter as any).isConnected = false;
      adapter.getPoolStats = vi.fn().mockReturnValue({
        total: 10,
        active: 0,
        idle: 0,
        waiting: 0,
      });

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy when all connections are active', async () => {
      adapter.getPoolStats = vi.fn().mockReturnValue({
        total: 10,
        active: 10,
        idle: 0,
        waiting: 5,
      });

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
    });

    it('should return unhealthy when ping fails', async () => {
      adapter.ping = vi.fn().mockRejectedValue(new Error('Connection refused'));

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.details.lastError).toBe('Connection refused');
    });

    it('should return unhealthy when ping returns false', async () => {
      adapter.ping = vi.fn().mockResolvedValue(false);

      checker = new HealthChecker(adapter, { logger });
      const result = await checker.check();

      expect(result.status).toBe('unhealthy');
      expect(result.details.lastError).toBe('Ping failed');
    });

    it('should timeout when ping takes too long', async () => {
      adapter.ping = vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(true), 10000)));

      checker = new HealthChecker(adapter, { timeout: 100, logger });

      const checkPromise = checker.check();
      await vi.advanceTimersByTimeAsync(150);
      const result = await checkPromise;

      expect(result.status).toBe('unhealthy');
      expect(result.details.lastError).toBe('Health check timeout');
    });

    it('should call onHealthChange when status changes', async () => {
      const onHealthChange = vi.fn();
      checker = new HealthChecker(adapter, { onHealthChange, logger });

      // First check - healthy
      await checker.check();
      expect(onHealthChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'healthy' }));

      // Second check - still healthy (no change)
      onHealthChange.mockClear();
      await checker.check();
      expect(onHealthChange).not.toHaveBeenCalled();

      // Third check - unhealthy (change)
      adapter.ping = vi.fn().mockRejectedValue(new Error('Failed'));
      await checker.check();
      expect(onHealthChange).toHaveBeenCalledWith(expect.objectContaining({ status: 'unhealthy' }));
    });

    it('should reset consecutive failures on healthy check', async () => {
      checker = new HealthChecker(adapter, { logger });

      // Cause some failures
      adapter.ping = vi.fn().mockRejectedValue(new Error('Failed'));
      await checker.check();
      await checker.check();
      expect(checker.getConsecutiveFailures()).toBe(2);

      // Successful check
      adapter.ping = vi.fn().mockResolvedValue(true);
      await checker.check();
      expect(checker.getConsecutiveFailures()).toBe(0);
    });
  });

  describe('start/stop', () => {
    it('should start periodic health checks', async () => {
      checker = new HealthChecker(adapter, { interval: 1000, logger });
      checker.start();

      expect(adapter.ping).toHaveBeenCalledTimes(1); // Initial check

      await vi.advanceTimersByTimeAsync(1000);
      expect(adapter.ping).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1000);
      expect(adapter.ping).toHaveBeenCalledTimes(3);

      checker.stop();
    });

    it('should not start multiple intervals', async () => {
      checker = new HealthChecker(adapter, { interval: 1000, logger });
      checker.start();
      checker.start(); // Second start should be ignored

      await vi.advanceTimersByTimeAsync(2000);
      expect(adapter.ping).toHaveBeenCalledTimes(3); // Initial + 2 intervals
    });

    it('should stop periodic health checks', async () => {
      checker = new HealthChecker(adapter, { interval: 1000, logger });
      checker.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(adapter.ping).toHaveBeenCalledTimes(2);

      checker.stop();

      await vi.advanceTimersByTimeAsync(3000);
      expect(adapter.ping).toHaveBeenCalledTimes(2); // No more calls
    });
  });

  describe('utility methods', () => {
    it('should return last result', async () => {
      checker = new HealthChecker(adapter, { logger });

      expect(checker.getLastResult()).toBeUndefined();

      await checker.check();
      const result = checker.getLastResult();

      expect(result).toBeDefined();
      expect(result?.status).toBe('healthy');
    });

    it('should return isHealthy based on last result', async () => {
      checker = new HealthChecker(adapter, { logger });

      expect(checker.isHealthy()).toBe(false); // No check yet

      await checker.check();
      expect(checker.isHealthy()).toBe(true);

      adapter.ping = vi.fn().mockRejectedValue(new Error('Failed'));
      await checker.check();
      expect(checker.isHealthy()).toBe(false);
    });

    it('should return uptime', async () => {
      checker = new HealthChecker(adapter, { logger });

      const uptime1 = checker.getUptime();
      await vi.advanceTimersByTimeAsync(5000);
      const uptime2 = checker.getUptime();

      expect(uptime2 - uptime1).toBeGreaterThanOrEqual(5000);
    });

    it('should return consecutive failures count', async () => {
      checker = new HealthChecker(adapter, { logger });
      adapter.ping = vi.fn().mockRejectedValue(new Error('Failed'));

      expect(checker.getConsecutiveFailures()).toBe(0);

      await checker.check();
      expect(checker.getConsecutiveFailures()).toBe(1);

      await checker.check();
      expect(checker.getConsecutiveFailures()).toBe(2);
    });
  });

  describe('waitForHealthy', () => {
    it('should resolve immediately if already healthy', async () => {
      checker = new HealthChecker(adapter, { logger });

      const promise = checker.waitForHealthy();
      await vi.advanceTimersByTimeAsync(0);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should wait until healthy', async () => {
      adapter.ping = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      checker = new HealthChecker(adapter, { logger });

      const promise = checker.waitForHealthy();

      // First check - unhealthy
      await vi.advanceTimersByTimeAsync(0);
      // Wait 1 second
      await vi.advanceTimersByTimeAsync(1000);
      // Second check - unhealthy
      await vi.advanceTimersByTimeAsync(0);
      // Wait 1 second
      await vi.advanceTimersByTimeAsync(1000);
      // Third check - healthy
      await vi.advanceTimersByTimeAsync(0);

      await expect(promise).resolves.toBeUndefined();
    });

    it('should throw if not healthy within timeout', async () => {
      vi.useRealTimers(); // Use real timers for this test

      adapter.ping = vi.fn().mockRejectedValue(new Error('Failed'));
      checker = new HealthChecker(adapter, { logger });

      // Use a very short timeout to make the test fast
      await expect(checker.waitForHealthy(50)).rejects.toThrow(
        'Health check did not become healthy within 50ms',
      );

      vi.useFakeTimers(); // Restore fake timers
    });
  });
});
