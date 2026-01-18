import type { DatabaseAdapter } from '../interfaces';
import type { Logger } from '../types';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  timestamp: Date;
  details: {
    connectionPool?: {
      total: number;
      active: number;
      idle: number;
      waiting: number;
    };
    lastError?: string;
    uptime?: number;
    version?: string;
  };
}

export interface HealthCheckOptions {
  interval?: number;
  timeout?: number;
  retries?: number;
  onHealthChange?: (result: HealthCheckResult) => void;
  logger?: Logger;
}

export class HealthChecker {
  private adapter: DatabaseAdapter;
  private options: Required<HealthCheckOptions>;
  private intervalId?: NodeJS.Timeout;
  private lastResult?: HealthCheckResult;
  private startTime: Date;
  private consecutiveFailures = 0;

  constructor(adapter: DatabaseAdapter, options: HealthCheckOptions = {}) {
    this.adapter = adapter;
    this.startTime = new Date();
    this.options = {
      interval: options.interval ?? 30_000, // 30 seconds
      timeout: options.timeout ?? 5000, // 5 seconds
      retries: options.retries ?? 3,
      onHealthChange: options.onHealthChange ?? (() => {}),
      logger: options.logger ?? console,
    };
  }

  async check(): Promise<HealthCheckResult> {
    const start = Date.now();

    try {
      // Basic ping test
      const isHealthy = await Promise.race([
        this.adapter.ping(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.options.timeout),
        ),
      ]);

      if (!isHealthy) {
        throw new Error('Ping failed');
      }

      // Get pool stats
      const poolStats = this.adapter.getPoolStats();

      // Determine health status
      let status: HealthCheckResult['status'] = 'healthy';

      if (poolStats.waiting > 0 || poolStats.active / poolStats.total > 0.8) {
        status = 'degraded';
      }

      if (!this.adapter.isConnected || poolStats.active === poolStats.total) {
        status = 'unhealthy';
      }

      const result: HealthCheckResult = {
        status,
        latency: Date.now() - start,
        timestamp: new Date(),
        details: {
          connectionPool: poolStats,
          uptime: Date.now() - this.startTime.getTime(),
          version: this.adapter.version,
        },
      };

      // Reset failure counter on success
      if (status === 'healthy') {
        this.consecutiveFailures = 0;
      }

      // Notify if health changed
      if (this.lastResult?.status !== result.status) {
        this.options.onHealthChange(result);
        this.options.logger.info(
          `Health status changed: ${this.lastResult?.status} -> ${result.status}`,
        );
      }

      this.lastResult = result;
      return result;
    } catch (error) {
      this.consecutiveFailures++;

      const result: HealthCheckResult = {
        status: 'unhealthy',
        latency: Date.now() - start,
        timestamp: new Date(),
        details: {
          lastError: (error as Error).message,
          uptime: Date.now() - this.startTime.getTime(),
        },
      };

      if (this.lastResult?.status !== 'unhealthy') {
        this.options.onHealthChange(result);
        this.options.logger.error('Health check failed', error);
      }

      this.lastResult = result;
      return result;
    }
  }

  start(): void {
    if (this.intervalId) {
      return;
    }

    // Initial check
    this.check().catch((error) => {
      this.options.logger.error('Initial health check failed', error);
    });

    // Schedule periodic checks
    this.intervalId = setInterval(() => {
      this.check().catch((error) => {
        this.options.logger.error('Periodic health check failed', error);
      });
    }, this.options.interval);

    this.options.logger.info('Health checker started', {
      interval: this.options.interval,
      timeout: this.options.timeout,
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.options.logger.info('Health checker stopped');
    }
  }

  getLastResult(): HealthCheckResult | undefined {
    return this.lastResult;
  }

  isHealthy(): boolean {
    return this.lastResult?.status === 'healthy';
  }

  getUptime(): number {
    return Date.now() - this.startTime.getTime();
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  async waitForHealthy(maxWaitTime = 60_000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const result = await this.check();

      if (result.status === 'healthy') {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Health check did not become healthy within ${maxWaitTime}ms`);
  }
}
