import { EventEmitter } from 'eventemitter3';

export interface QueryMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageLatency: number;
  minLatency: number;
  maxLatency: number;
  queriesPerSecond: number;
  cacheHitRate: number;
  slowQueries: number;
  queryDistribution: Record<string, number>; // SELECT, INSERT, UPDATE, DELETE, etc.
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  connectionErrors: number;
  averageConnectionTime: number;
  connectionReuse: number;
}

export interface TransactionMetrics {
  totalTransactions: number;
  committedTransactions: number;
  rolledBackTransactions: number;
  averageTransactionDuration: number;
  activeTransactions: number;
  deadlocks: number;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  timestamp: Date;
}

export interface MetricsSnapshot {
  query: QueryMetrics;
  connection: ConnectionMetrics;
  transaction: TransactionMetrics;
  system: SystemMetrics;
  custom: Record<string, unknown>;
}

export class MetricsCollector extends EventEmitter {
  private queryMetrics: QueryMetrics;
  private connectionMetrics: ConnectionMetrics;
  private transactionMetrics: TransactionMetrics;
  private queryLatencies: number[] = [];
  private connectionTimes: number[] = [];
  private transactionDurations: number[] = [];
  private startTime: Date;
  private slowQueryThreshold: number;
  private customMetrics: Record<string, unknown> = {};
  private interval?: NodeJS.Timeout;

  constructor(options: { slowQueryThreshold?: number; collectionInterval?: number } = {}) {
    super();
    this.startTime = new Date();
    this.slowQueryThreshold = options.slowQueryThreshold ?? 1000; // 1 second

    this.queryMetrics = this.createEmptyQueryMetrics();
    this.connectionMetrics = this.createEmptyConnectionMetrics();
    this.transactionMetrics = this.createEmptyTransactionMetrics();

    if (options.collectionInterval) {
      this.startCollection(options.collectionInterval);
    }
  }

  private createEmptyQueryMetrics(): QueryMetrics {
    return {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      averageLatency: 0,
      minLatency: Infinity,
      maxLatency: 0,
      queriesPerSecond: 0,
      cacheHitRate: 0,
      slowQueries: 0,
      queryDistribution: {},
    };
  }

  private createEmptyConnectionMetrics(): ConnectionMetrics {
    return {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      connectionErrors: 0,
      averageConnectionTime: 0,
      connectionReuse: 0,
    };
  }

  private createEmptyTransactionMetrics(): TransactionMetrics {
    return {
      totalTransactions: 0,
      committedTransactions: 0,
      rolledBackTransactions: 0,
      averageTransactionDuration: 0,
      activeTransactions: 0,
      deadlocks: 0,
    };
  }

  recordQuery(command: string, latency: number, success: boolean, cacheHit = false): void {
    this.queryMetrics.totalQueries++;
    
    if (success) {
      this.queryMetrics.successfulQueries++;
    } else {
      this.queryMetrics.failedQueries++;
    }

    // Update latency metrics
    this.queryLatencies.push(latency);
    if (this.queryLatencies.length > 1000) {
      this.queryLatencies.shift(); // Keep only last 1000 queries
    }

    this.queryMetrics.minLatency = Math.min(this.queryMetrics.minLatency, latency);
    this.queryMetrics.maxLatency = Math.max(this.queryMetrics.maxLatency, latency);
    this.queryMetrics.averageLatency = this.calculateAverage(this.queryLatencies);

    // Track slow queries
    if (latency > this.slowQueryThreshold) {
      this.queryMetrics.slowQueries++;
      this.emit('slowQuery', { command, latency });
    }

    // Update query distribution
    const queryType = command.toUpperCase();
    this.queryMetrics.queryDistribution[queryType] = 
      (this.queryMetrics.queryDistribution[queryType] || 0) + 1;

    // Update QPS
    const elapsedSeconds = (Date.now() - this.startTime.getTime()) / 1000;
    this.queryMetrics.queriesPerSecond = this.queryMetrics.totalQueries / elapsedSeconds;

    // Update cache hit rate
    if (cacheHit) {
      const cacheHits = this.customMetrics['cacheHits'] as number || 0;
      this.customMetrics['cacheHits'] = cacheHits + 1;
    }
    const cacheHits = this.customMetrics['cacheHits'] as number || 0;
    this.queryMetrics.cacheHitRate = this.queryMetrics.totalQueries > 0
      ? cacheHits / this.queryMetrics.totalQueries
      : 0;
  }

  recordConnection(connected: boolean, connectionTime?: number): void {
    this.connectionMetrics.totalConnections++;
    
    if (connected) {
      this.connectionMetrics.activeConnections++;
      
      if (connectionTime) {
        this.connectionTimes.push(connectionTime);
        if (this.connectionTimes.length > 100) {
          this.connectionTimes.shift();
        }
        this.connectionMetrics.averageConnectionTime = this.calculateAverage(this.connectionTimes);
      }
    } else {
      this.connectionMetrics.connectionErrors++;
    }
  }

  recordTransaction(
    action: 'start' | 'commit' | 'rollback',
    duration?: number,
    isDeadlock = false
  ): void {
    switch (action) {
      case 'start':
        this.transactionMetrics.totalTransactions++;
        this.transactionMetrics.activeTransactions++;
        break;
      
      case 'commit':
        this.transactionMetrics.committedTransactions++;
        this.transactionMetrics.activeTransactions = Math.max(0, this.transactionMetrics.activeTransactions - 1);
        break;
      
      case 'rollback':
        this.transactionMetrics.rolledBackTransactions++;
        this.transactionMetrics.activeTransactions = Math.max(0, this.transactionMetrics.activeTransactions - 1);
        
        if (isDeadlock) {
          this.transactionMetrics.deadlocks++;
          this.emit('deadlock');
        }
        break;
    }

    if (duration) {
      this.transactionDurations.push(duration);
      if (this.transactionDurations.length > 100) {
        this.transactionDurations.shift();
      }
      this.transactionMetrics.averageTransactionDuration = this.calculateAverage(this.transactionDurations);
    }
  }

  updateConnectionPool(stats: { total: number; active: number; idle: number }): void {
    this.connectionMetrics.activeConnections = stats.active;
    this.connectionMetrics.idleConnections = stats.idle;
    this.connectionMetrics.connectionReuse = stats.total > 0
      ? (this.queryMetrics.totalQueries / stats.total)
      : 0;
  }

  setCustomMetric(key: string, value: unknown): void {
    this.customMetrics[key] = value;
  }

  incrementCustomMetric(key: string, value = 1): void {
    const current = this.customMetrics[key] as number || 0;
    this.customMetrics[key] = current + value;
  }

  getSnapshot(): MetricsSnapshot {
    return {
      query: { ...this.queryMetrics },
      connection: { ...this.connectionMetrics },
      transaction: { ...this.transactionMetrics },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        timestamp: new Date(),
      },
      custom: { ...this.customMetrics },
    };
  }

  reset(): void {
    this.queryMetrics = this.createEmptyQueryMetrics();
    this.connectionMetrics = this.createEmptyConnectionMetrics();
    this.transactionMetrics = this.createEmptyTransactionMetrics();
    this.queryLatencies = [];
    this.connectionTimes = [];
    this.transactionDurations = [];
    this.customMetrics = {};
    this.startTime = new Date();
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  private startCollection(interval: number): void {
    this.interval = setInterval(() => {
      const snapshot = this.getSnapshot();
      this.emit('metrics', snapshot);
    }, interval);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  // Prometheus-style metrics export
  exportPrometheus(): string {
    const metrics = this.getSnapshot();
    const lines: string[] = [];

    // Query metrics
    lines.push(`# HELP db_queries_total Total number of queries executed`);
    lines.push(`# TYPE db_queries_total counter`);
    lines.push(`db_queries_total ${metrics.query.totalQueries}`);

    lines.push(`# HELP db_query_duration_seconds Query execution duration in seconds`);
    lines.push(`# TYPE db_query_duration_seconds summary`);
    lines.push(`db_query_duration_seconds{quantile="0.5"} ${metrics.query.averageLatency / 1000}`);
    lines.push(`db_query_duration_seconds{quantile="0.99"} ${metrics.query.maxLatency / 1000}`);
    lines.push(`db_query_duration_seconds_sum ${(metrics.query.averageLatency * metrics.query.totalQueries) / 1000}`);
    lines.push(`db_query_duration_seconds_count ${metrics.query.totalQueries}`);

    // Connection metrics
    lines.push(`# HELP db_connections_active Number of active database connections`);
    lines.push(`# TYPE db_connections_active gauge`);
    lines.push(`db_connections_active ${metrics.connection.activeConnections}`);

    // Transaction metrics
    lines.push(`# HELP db_transactions_total Total number of transactions`);
    lines.push(`# TYPE db_transactions_total counter`);
    lines.push(`db_transactions_total{status="committed"} ${metrics.transaction.committedTransactions}`);
    lines.push(`db_transactions_total{status="rolled_back"} ${metrics.transaction.rolledBackTransactions}`);

    // System metrics
    lines.push(`# HELP nodejs_heap_size_total_bytes Process heap size in bytes`);
    lines.push(`# TYPE nodejs_heap_size_total_bytes gauge`);
    lines.push(`nodejs_heap_size_total_bytes ${metrics.system.memoryUsage.heapTotal}`);

    return lines.join('\n');
  }
}