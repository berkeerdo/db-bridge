import { describe, it, expect } from 'vitest';
import { HealthChecker } from '../health-checker';

describe('HealthChecker', () => {
  it('should be importable', () => {
    expect(HealthChecker).toBeDefined();
  });
});