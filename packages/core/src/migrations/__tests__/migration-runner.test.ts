import { describe, it, expect } from 'vitest';
import { MigrationRunner } from '../migration-runner';

describe('MigrationRunner', () => {
  it('should be importable', () => {
    expect(MigrationRunner).toBeDefined();
  });
});