import { TraceBaseTrait, PerformanceTrace } from './trace-base-trait';

export class TraceManagementTrait extends TraceBaseTrait {
  startTrace(operation: string, metadata: Record<string, unknown> = {}, parent?: string): string {
    if (!this.enabled) return '';

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
      this.cleanupOldTraces();
    }

    this.emit('traceStart', trace);
    return id;
  }

  endTrace(id: string, error?: Error): void {
    if (!this.enabled || !id) return;

    const trace = this.traces.get(id);
    if (!trace) return;

    trace.endTime = performance.now();
    trace.duration = trace.endTime - trace.startTime;
    trace.status = error ? 'failed' : 'completed';
    trace.error = error;

    this.emit('traceEnd', trace);
  }

  protected cleanupOldTraces(): void {
    const oldestTraces = Array.from(this.traces.entries())
      .sort(([, a], [, b]) => a.startTime - b.startTime)
      .slice(0, Math.floor(this.maxTraces * 0.1));
    
    oldestTraces.forEach(([id]) => this.traces.delete(id));
  }

  getTrace(id: string): PerformanceTrace | undefined {
    return this.traces.get(id);
  }

  getChildTraces(parentId: string): PerformanceTrace[] {
    const parent = this.traces.get(parentId);
    if (!parent) return [];

    return parent.children
      .map(id => this.traces.get(id))
      .filter(trace => trace !== undefined) as PerformanceTrace[];
  }

  getTraceHierarchy(rootId: string): PerformanceTrace | null {
    const root = this.traces.get(rootId);
    if (!root) return null;

    const buildHierarchy = (trace: PerformanceTrace): PerformanceTrace => {
      const children = trace.children
        .map(id => this.traces.get(id))
        .filter(child => child !== undefined)
        .map(child => buildHierarchy(child!));
      
      return { ...trace, children: children as any };
    };

    return buildHierarchy(root);
  }
}