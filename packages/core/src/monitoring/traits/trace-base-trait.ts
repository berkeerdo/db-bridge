import { EventEmitter } from 'eventemitter3';

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

export class TraceBaseTrait extends EventEmitter {
  protected traces = new Map<string, PerformanceTrace>();
  protected enabled = true;
  protected maxTraces: number;

  constructor(maxTraces = 10000, enabled = true) {
    super();
    this.maxTraces = maxTraces;
    this.enabled = enabled;
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

  protected generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  reset(): void {
    this.traces.clear();
  }
}