import { describe, it, expect, vi, beforeEach } from 'vitest';

import { count, sum, avg, min, max, exists } from '../aggregate-trait';

import type { AggregateContext } from '../aggregate-trait';

describe('aggregate-trait', () => {
  let ctx: AggregateContext;

  beforeEach(() => {
    ctx = {
      adapter: {
        query: vi.fn().mockResolvedValue({
          rows: [{ count: 42 }],
          rowCount: 1,
          fields: [],
        }),
      },
      selectColumns: ['id', 'name'],
      escapeIdentifierFn: (id) => `"${id}"`,
      toSQL: vi.fn().mockReturnValue({ sql: 'SELECT * FROM users', bindings: [] }),
    } as unknown as AggregateContext;
  });

  describe('count', () => {
    it('should count all rows with default column', async () => {
      const result = await count(ctx);

      expect(result).toBe(42);
      expect(ctx.adapter.query).toHaveBeenCalled();
    });

    it('should count with specific column', async () => {
      await count(ctx, 'id');

      // Check that selectColumns was temporarily modified
      expect(ctx.selectColumns).toEqual(['id', 'name']); // restored
    });

    it('should return 0 when no rows', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const result = await count(ctx);

      expect(result).toBe(0);
    });
  });

  describe('sum', () => {
    it('should sum column values', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: 1500 }],
        rowCount: 1,
        fields: [],
      });

      const result = await sum(ctx, 'price');

      expect(result).toBe(1500);
    });

    it('should return 0 when aggregate is null', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: null }],
        rowCount: 1,
        fields: [],
      });

      const result = await sum(ctx, 'price');

      expect(result).toBe(0);
    });

    it('should handle string aggregate value', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: '2500.50' }],
        rowCount: 1,
        fields: [],
      });

      const result = await sum(ctx, 'price');

      expect(result).toBe(2500.5);
    });
  });

  describe('avg', () => {
    it('should calculate average', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: 75.5 }],
        rowCount: 1,
        fields: [],
      });

      const result = await avg(ctx, 'score');

      expect(result).toBe(75.5);
    });

    it('should return 0 when aggregate is null', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: null }],
        rowCount: 1,
        fields: [],
      });

      const result = await avg(ctx, 'score');

      expect(result).toBe(0);
    });
  });

  describe('min', () => {
    it('should find minimum value', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: 10 }],
        rowCount: 1,
        fields: [],
      });

      const result = await min(ctx, 'age');

      expect(result).toBe(10);
    });

    it('should return null when aggregate is null', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: null }],
        rowCount: 1,
        fields: [],
      });

      const result = await min(ctx, 'age');

      expect(result).toBeNull();
    });

    it('should return null when aggregate is undefined', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{}],
        rowCount: 1,
        fields: [],
      });

      const result = await min(ctx, 'age');

      expect(result).toBeNull();
    });
  });

  describe('max', () => {
    it('should find maximum value', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: 99 }],
        rowCount: 1,
        fields: [],
      });

      const result = await max(ctx, 'age');

      expect(result).toBe(99);
    });

    it('should return null when aggregate is null', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: null }],
        rowCount: 1,
        fields: [],
      });

      const result = await max(ctx, 'age');

      expect(result).toBeNull();
    });

    it('should return null when aggregate is undefined', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{}],
        rowCount: 1,
        fields: [],
      });

      const result = await max(ctx, 'age');

      expect(result).toBeNull();
    });

    it('should handle string aggregate value', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ aggregate: '150' }],
        rowCount: 1,
        fields: [],
      });

      const result = await max(ctx, 'score');

      expect(result).toBe(150);
    });
  });

  describe('exists', () => {
    it('should return true when rows exist', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ count: 5 }],
        rowCount: 1,
        fields: [],
      });

      const result = await exists(ctx);

      expect(result).toBe(true);
    });

    it('should return false when no rows exist', async () => {
      ctx.adapter.query = vi.fn().mockResolvedValue({
        rows: [{ count: 0 }],
        rowCount: 1,
        fields: [],
      });

      const result = await exists(ctx);

      expect(result).toBe(false);
    });
  });

  describe('selectColumns restoration', () => {
    it('should restore selectColumns after aggregate query', async () => {
      const originalColumns = ['id', 'name', 'email'];
      ctx.selectColumns = [...originalColumns];

      await count(ctx);

      expect(ctx.selectColumns).toEqual(originalColumns);
    });

    it('should restore selectColumns even if query fails', async () => {
      const originalColumns = ['id', 'name'];
      ctx.selectColumns = [...originalColumns];
      ctx.adapter.query = vi.fn().mockRejectedValue(new Error('Query failed'));

      await expect(count(ctx)).rejects.toThrow('Query failed');
      expect(ctx.selectColumns).toEqual(originalColumns);
    });
  });
});
