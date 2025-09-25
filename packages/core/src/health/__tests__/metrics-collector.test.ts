import { describe, it, expect } from 'vitest';
import { MetricsCollector } from '../metrics-collector';

describe('MetricsCollector', () => {
  it('should be importable', () => {
    expect(MetricsCollector).toBeDefined();
  });
});