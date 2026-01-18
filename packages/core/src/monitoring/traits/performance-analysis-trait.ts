import { QueryAnalysisTrait } from './query-analysis-trait';

export interface PerformanceReport {
  slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    params?: unknown[];
  }>;
  queryPlans: any[];
  bottlenecks: Array<{
    operation: string;
    averageDuration: number;
    count: number;
    impact: number;
  }>;
  recommendations: string[];
}

export class PerformanceAnalysisTrait extends QueryAnalysisTrait {
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
    const recommendations = this.generateRecommendations(recentTraces);

    return {
      slowQueries: this.slowQueries.slice(-20),
      queryPlans: Array.from(this.queryPlans.values()),
      bottlenecks,
      recommendations,
    };
  }

  protected generateRecommendations(traces: any[]): string[] {
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
    const longTransactions = traces.filter(
      (t) => t.operation.includes('transaction') && (t.duration || 0) > 5000,
    );
    if (longTransactions.length > 0) {
      recommendations.push(
        'Long-running transactions detected. Consider breaking them into smaller units.',
      );
    }

    return recommendations;
  }

  getBottlenecks(limit = 10): Array<{ operation: string; avgDuration: number; count: number }> {
    const operationStats = new Map<string, { totalTime: number; count: number }>();

    Array.from(this.traces.values())
      .filter((trace) => trace.status === 'completed')
      .forEach((trace) => {
        const stats = operationStats.get(trace.operation) || { totalTime: 0, count: 0 };
        stats.totalTime += trace.duration || 0;
        stats.count += 1;
        operationStats.set(trace.operation, stats);
      });

    return Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        avgDuration: stats.totalTime / stats.count,
        count: stats.count,
      }))
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }
}
