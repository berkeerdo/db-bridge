import { describe, it, expect } from 'vitest';
import { PerformanceMonitor } from '../performance-monitor';

describe('PerformanceMonitor', () => {
  it('should be importable', () => {
    expect(PerformanceMonitor).toBeDefined();
  });
});