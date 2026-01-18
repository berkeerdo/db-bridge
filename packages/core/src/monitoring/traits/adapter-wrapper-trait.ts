import { PerformanceAnalysisTrait } from './performance-analysis-trait';

import type { DatabaseAdapter } from '../../interfaces';
import type { QueryParams, QueryOptions, QueryResult } from '../../types';

export class AdapterWrapperTrait extends PerformanceAnalysisTrait {
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

    // Wrap other methods
    this.wrapMethod(adapter, 'beginTransaction', 'transaction');
    this.wrapMethod(adapter, 'connect', 'connection');
    this.wrapMethod(adapter, 'disconnect', 'connection');

    return adapter;
  }

  protected wrapMethod(adapter: any, methodName: string, operationType: string): void {
    const original = adapter[methodName];
    if (typeof original !== 'function') {
      return;
    }

    adapter[methodName] = async (...args: any[]) => {
      const traceId = this.startTrace(`${operationType}.${methodName}`, {
        args: args.slice(0, 2), // Limit logged args
      });

      try {
        const result = await original.apply(adapter, args);
        this.endTrace(traceId);
        return result;
      } catch (error) {
        this.endTrace(traceId, error as Error);
        throw error;
      }
    };
  }

  unwrapAdapter(adapter: DatabaseAdapter): void {
    // This would restore original methods, but for simplicity
    // we recommend creating a new adapter instance instead
    this.emit('adapterUnwrapped', { adapter });
  }
}
