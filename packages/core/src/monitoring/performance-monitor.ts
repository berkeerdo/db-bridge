import { EventEmitter } from 'eventemitter3';

import type { DatabaseAdapter } from '../interfaces';
import type { QueryOptions, QueryResult, QueryParams } from '../types';

export interface PerformanceTrace {
  id: string;
  operation: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata: Record<string, unknown>;
  status: 'started' | 'completed' | 'failed';
  error?: Error;
  parent?: string;
  children: string[];
}

export interface QueryPlan {
  query: string;
  plan: string;
  cost: number;
  rows: number;
  width: number;
  actualTime?: number;
  actualRows?: number;
}

export interface PerformanceReport {
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    params?: unknown[];
  }>;
  queryPlans: QueryPlan[];
  bottlenecks: Array<{
    operation: string;
    averageDuration: number;
    count: number;
    impact: number; // percentage of total time
  }>;
  recommendations: string[];
}

export class PerformanceMonitor extends EventEmitter {
  private traces: Map<string, PerformanceTrace> = new Map();
  private slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    params?: unknown[];
  }> = [];
  private queryPlans: Map<string, QueryPlan> = new Map();
  private slowQueryThreshold: number;
  private maxTraces: number;
  private adapter: DatabaseAdapter;
  private enabled: boolean;

  constructor(
    adapter: DatabaseAdapter,
    options: {
      slowQueryThreshold?: number;
      maxTraces?: number;
      enabled?: boolean;
    } = {},
  ) {
    super();
    this.adapter = adapter;
    this.slowQueryThreshold = options.slowQueryThreshold ?? 1000; // 1 second
    this.maxTraces = options.maxTraces ?? 10_000;
    this.enabled = options.enabled ?? true;
  }

  startTrace(operation: string, metadata: Record<string, unknown> = {}, parent?: string): string {
    if (!this.enabled) {
      return '';
    }

    const id = this.generateTraceId();
    const trace: PerformanceTrace = {
      id,
      operation,
      startTime: performance.now(),
      metadata,
      status: 'started',
      parent,
      children: [],
    };

    this.traces.set(id, trace);

    // Add to parent's children if exists
    if (parent) {
      const parentTrace = this.traces.get(parent);
      if (parentTrace) {
        parentTrace.children.push(id);
      }
    }

    // Clean up old traces if needed
    if (this.traces.size > this.maxTraces) {
      const oldestTraces = Array.from(this.traces.entries())
        .sort(([, a], [, b]) => a.startTime - b.startTime)
        .slice(0, Math.floor(this.maxTraces * 0.1));

      oldestTraces.forEach(([id]) => this.traces.delete(id));
    }

    this.emit('traceStart', trace);
    return id;
  }

  endTrace(id: string, error?: Error): void {
    if (!this.enabled || !id) {
      return;
    }

    const trace = this.traces.get(id);
    if (!trace) {
      return;
    }

    trace.endTime = performance.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = error ? 'failed' : 'completed';
    trace.error = error;

    // Check for slow operations
    if (trace.duration > this.slowQueryThreshold && trace.operation.includes('query')) {
      const queryInfo = {
        query: (trace.metadata['sql'] as string) || '',
        duration: trace.duration,
        timestamp: new Date(),
        params: trace.metadata['params'] as unknown[],
      };

      this.slowQueries.push(queryInfo);
      this.emit('slowQuery', queryInfo);

      // Keep only recent slow queries
      if (this.slowQueries.length > 100) {
        this.slowQueries = this.slowQueries.slice(-100);
      }
    }

    this.emit('traceEnd', trace);
  }

  async explainQuery(sql: string, params?: QueryParams): Promise<QueryPlan | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      let explainSql: string;

      // Database-specific EXPLAIN syntax
      if (this.adapter.name === 'PostgreSQL') {
        explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
      } else if (this.adapter.name === 'MySQL') {
        explainSql = `EXPLAIN FORMAT=JSON ${sql}`;
      } else {
        return null;
      }

      const result = await this.adapter.query(explainSql, params);

      if (result.rows.length > 0) {
        const plan = this.parseExplainResult(result.rows[0] as Record<string, unknown>);
        if (plan) {
          this.queryPlans.set(sql, plan);
          return plan;
        }
      }
    } catch (error) {
      // Ignore explain errors
      this.emit('explainError', { sql, error });
    }

    return null;
  }

  private parseExplainResult(result: Record<string, unknown>): QueryPlan | null {
    try {
      if (this.adapter.name === 'PostgreSQL') {
        const planData = (result['QUERY PLAN'] as any[]) || result;
        const plan = Array.isArray(planData) ? planData[0] : planData;

        return {
          query: plan.Query || '',
          plan: JSON.stringify(plan.Plan || plan),
          cost: plan.Plan?.['Total Cost'] || 0,
          rows: plan.Plan?.['Plan Rows'] || 0,
          width: plan.Plan?.['Plan Width'] || 0,
          actualTime: plan.Plan?.['Actual Total Time'] || 0,
          actualRows: plan.Plan?.['Actual Rows'] || 0,
        };
      } else if (this.adapter.name === 'MySQL') {
        const plan = typeof result === 'string' ? JSON.parse(result as string) : result;
        const queryBlock = plan.query_block || {};

        return {
          query: '',
          plan: JSON.stringify(plan),
          cost: queryBlock.cost_info?.query_cost || 0,
          rows: queryBlock.table?.rows_examined_per_scan || 0,
          width: 0,
        };
      }
    } catch {
      // Failed to parse
    }

    return null;
  }

  async analyzePerformance(duration: number = 3_600_000): Promise<PerformanceReport> {
    const now = performance.now();
    const cutoff = now - duration;

    // Get recent traces
    const recentTraces = Array.from(this.traces.values()).filter(
      (trace) => trace.startTime > cutoff && trace.status === 'completed',
    );

    // Group by operation
    const operationStats = new Map<string, { totalTime: number; count: number }>();
    let totalTime = 0;

    recentTraces.forEach((trace) => {
      const stats = operationStats.get(trace.operation) || { totalTime: 0, count: 0 };
      stats.totalTime += trace.duration || 0;
      stats.count += 1;
      operationStats.set(trace.operation, stats);
      totalTime += trace.duration || 0;
    });

    // Identify bottlenecks
    const bottlenecks = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        averageDuration: stats.totalTime / stats.count,
        count: stats.count,
        impact: (stats.totalTime / totalTime) * 100,
      }))
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 10);

    // Generate recommendations
    const recommendations: string[] = [];

    // Check for missing indexes
    const slowSelects = this.slowQueries.filter(
      (q) => q.query.toUpperCase().includes('SELECT') && q.duration > 2000,
    );
    if (slowSelects.length > 5) {
      recommendations.push('Consider adding indexes. Multiple slow SELECT queries detected.');
    }

    // Check for N+1 queries
    const queryGroups = new Map<string, number>();
    this.slowQueries.forEach((q) => {
      const normalized = q.query.replaceAll(/\d+/g, '?').replaceAll(/\s+/g, ' ');
      queryGroups.set(normalized, (queryGroups.get(normalized) || 0) + 1);
    });

    const repetitiveQueries = Array.from(queryGroups.entries()).filter(([, count]) => count > 10);

    if (repetitiveQueries.length > 0) {
      recommendations.push(
        'Possible N+1 query problem detected. Consider using JOINs or batch loading.',
      );
    }

    // Check connection pool usage
    const poolStats = this.adapter.getPoolStats();
    if (poolStats.waiting > 0) {
      recommendations.push(
        `Connection pool exhaustion detected. Consider increasing pool size (current: ${poolStats.total}).`,
      );
    }

    // Check for long transactions
    const longTransactions = recentTraces.filter(
      (t) => t.operation.includes('transaction') && (t.duration || 0) > 5000,
    );
    if (longTransactions.length > 0) {
      recommendations.push(
        'Long-running transactions detected. Consider breaking them into smaller units.',
      );
    }

    return {
      slowQueries: this.slowQueries.slice(-20),
      queryPlans: Array.from(this.queryPlans.values()),
      bottlenecks,
      recommendations,
    };
  }

  wrapAdapter(adapter: DatabaseAdapter): DatabaseAdapter {
    const originalQuery = adapter.query.bind(adapter);

    adapter.query = async <T = unknown>(
      sql: string,
      params?: QueryParams,
      options?: QueryOptions,
    ): Promise<QueryResult<T>> => {
      const traceId = this.startTrace('query', { sql, params });

      try {
        const result = await originalQuery<T>(sql, params, options);
        this.endTrace(traceId);

        // Analyze slow queries
        const trace = this.traces.get(traceId);
        if (trace?.duration && trace.duration > this.slowQueryThreshold) {
          this.explainQuery(sql, params).catch(() => {
            // Ignore explain errors
          });
        }

        return result;
      } catch (error) {
        this.endTrace(traceId, error as Error);
        throw error;
      }
    };

    return adapter;
  }

  reset(): void {
    this.traces.clear();
    this.slowQueries = [];
    this.queryPlans.clear();
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }

  getTraces(filter?: {
    operation?: string;
    status?: PerformanceTrace['status'];
    minDuration?: number;
    parent?: string;
  }): PerformanceTrace[] {
    let traces = Array.from(this.traces.values());

    if (filter) {
      if (filter.operation) {
        traces = traces.filter((t) => t.operation.includes(filter.operation!));
      }
      if (filter.status) {
        traces = traces.filter((t) => t.status === filter.status);
      }
      if (filter.minDuration !== undefined) {
        traces = traces.filter((t) => (t.duration || 0) >= filter.minDuration!);
      }
      if (filter.parent !== undefined) {
        traces = traces.filter((t) => t.parent === filter.parent);
      }
    }

    return traces.sort((a, b) => b.startTime - a.startTime);
  }

  getSlowQueries(limit = 20): typeof this.slowQueries {
    return this.slowQueries.slice(-limit);
  }

  exportTraces(): string {
    const traces = Array.from(this.traces.values());
    return JSON.stringify(traces, null, 2);
  }

  importTraces(data: string): void {
    try {
      const traces = JSON.parse(data) as PerformanceTrace[];
      traces.forEach((trace) => {
        this.traces.set(trace.id, trace);
      });
    } catch (error) {
      throw new Error(`Failed to import traces: ${(error as Error).message}`);
    }
  }
}
