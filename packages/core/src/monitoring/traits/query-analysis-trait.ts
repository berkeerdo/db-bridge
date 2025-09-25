import { DatabaseAdapter } from '../../interfaces';
import { QueryParams } from '../../types';
import { TraceManagementTrait } from './trace-management-trait';

export interface QueryPlan {
  query: string;
  plan: string;
  cost: number;
  rows: number;
  width: number;
  actualTime?: number;
  actualRows?: number;
}

export class QueryAnalysisTrait extends TraceManagementTrait {
  protected adapter: DatabaseAdapter;
  protected slowQueryThreshold: number;
  protected slowQueries: Array<{
    query: string;
    duration: number;
    timestamp: Date;
    params?: unknown[];
  }> = [];
  protected queryPlans = new Map<string, QueryPlan>();

  constructor(adapter: DatabaseAdapter, slowQueryThreshold = 1000, maxTraces = 10000, enabled = true) {
    super(maxTraces, enabled);
    this.adapter = adapter;
    this.slowQueryThreshold = slowQueryThreshold;
  }

  override endTrace(id: string, error?: Error): void {
    super.endTrace(id, error);

    const trace = this.traces.get(id);
    if (!trace || !trace.duration) return;

    // Check for slow operations
    if (trace.duration > this.slowQueryThreshold && trace.operation.includes('query')) {
      const queryInfo = {
        query: trace.metadata['sql'] as string || '',
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
  }

  async explainQuery(sql: string, params?: QueryParams): Promise<QueryPlan | null> {
    if (!this.enabled) return null;

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
      this.emit('explainError', { sql, error });
    }

    return null;
  }

  protected parseExplainResult(result: Record<string, unknown>): QueryPlan | null {
    try {
      if (this.adapter.name === 'PostgreSQL') {
        const planData = result['QUERY PLAN'] as any[] || result;
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
    } catch (error) {
      // Failed to parse
    }

    return null;
  }

  getSlowQueries(limit = 20): typeof this.slowQueries {
    return this.slowQueries.slice(-limit);
  }

  override reset(): void {
    super.reset();
    this.slowQueries = [];
    this.queryPlans.clear();
  }
}