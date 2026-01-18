import { describe, it, expect, vi, beforeEach } from 'vitest';

import { paginate, cursorPaginate, chunk } from '../pagination-trait';

import type { PaginationContext, PaginationState } from '../pagination-trait';

describe('pagination-trait', () => {
  let ctx: PaginationContext<{ id: number; name: string }>;
  let state: PaginationState;

  beforeEach(() => {
    state = {};
    ctx = {
      toSQL: vi.fn().mockReturnValue({ sql: 'SELECT * FROM users', bindings: [] }),
      where: vi.fn(),
      orderBy: vi.fn(),
      count: vi.fn().mockResolvedValue(100),
      execute: vi.fn().mockResolvedValue({
        rows: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
        rowCount: 15,
        fields: [],
      }),
    };
  });

  describe('paginate', () => {
    it('should paginate with default values', async () => {
      const result = await paginate(ctx, state, 1, 15);

      expect(result.pagination.page).toBe(1);
      expect(result.pagination.perPage).toBe(15);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.totalPages).toBe(7); // ceil(100/15)
      expect(result.pagination.hasMore).toBe(true);
      expect(result.data).toHaveLength(15);
    });

    it('should calculate from and to correctly', async () => {
      const result = await paginate(ctx, state, 2, 15);

      expect(result.pagination.from).toBe(16);
      expect(result.pagination.to).toBe(30);
    });

    it('should set limit and offset in state', async () => {
      await paginate(ctx, state, 3, 10);

      expect(state.limitValue).toBe(10);
      expect(state.offsetValue).toBe(20); // (3-1) * 10
    });

    it('should handle page < 1', async () => {
      const result = await paginate(ctx, state, 0, 15);

      expect(result.pagination.page).toBe(1);
      expect(state.offsetValue).toBe(0);
    });

    it('should handle perPage < 1', async () => {
      const result = await paginate(ctx, state, 1, 0);

      expect(result.pagination.perPage).toBe(15);
    });

    it('should handle last page', async () => {
      ctx.count = vi.fn().mockResolvedValue(100);
      ctx.execute = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 91, name: `User ${i + 91}` })),
        rowCount: 10,
        fields: [],
      });

      const result = await paginate(ctx, state, 7, 15);

      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.to).toBe(100);
    });

    it('should handle empty results', async () => {
      ctx.count = vi.fn().mockResolvedValue(0);
      ctx.execute = vi.fn().mockResolvedValue({
        rows: [],
        rowCount: 0,
        fields: [],
      });

      const result = await paginate(ctx, state, 1, 15);

      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
      expect(result.pagination.from).toBe(0);
      expect(result.pagination.to).toBe(0);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  describe('cursorPaginate', () => {
    it('should paginate with cursor', async () => {
      ctx.execute = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 21 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
        rowCount: 21,
        fields: [],
      });

      const result = await cursorPaginate(ctx, state, 'id', null, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(20);
      expect(ctx.orderBy).toHaveBeenCalledWith('id', 'ASC');
    });

    it('should add where clause when cursor is provided', async () => {
      ctx.execute = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 11, name: `User ${i + 11}` })),
        rowCount: 10,
        fields: [],
      });

      const result = await cursorPaginate(ctx, state, 'id', 10, 20);

      expect(ctx.where).toHaveBeenCalledWith('id', '>', 10);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should set limit to limit + 1 to detect hasMore', async () => {
      await cursorPaginate(ctx, state, 'id', null, 20);

      expect(state.limitValue).toBe(21);
    });

    it('should handle string cursor column', async () => {
      ctx.execute = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 11 }, (_, i) => ({
          slug: `item-${String(i + 1).padStart(2, '0')}`,
          name: `Item ${i + 1}`,
        })),
        rowCount: 11,
        fields: [],
      });

      const result = await cursorPaginate(ctx, state, 'slug', 'item-00', 10);

      expect(ctx.where).toHaveBeenCalledWith('slug', '>', 'item-00');
      expect(result.nextCursor).toBe('item-10');
    });

    it('should return null nextCursor when no more results', async () => {
      ctx.execute = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
        rowCount: 5,
        fields: [],
      });

      const result = await cursorPaginate(ctx, state, 'id', null, 10);

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('chunk', () => {
    it('should process results in chunks', async () => {
      ctx.count = vi
        .fn()
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(50);
      ctx.execute = vi
        .fn()
        .mockResolvedValueOnce({
          rows: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
          rowCount: 20,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: Array.from({ length: 20 }, (_, i) => ({ id: i + 21, name: `User ${i + 21}` })),
          rowCount: 20,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 41, name: `User ${i + 41}` })),
          rowCount: 10,
          fields: [],
        });

      const chunks: { id: number; name: string }[][] = [];
      const pages: number[] = [];

      await chunk(ctx, state, 20, async (items, page) => {
        chunks.push(items);
        pages.push(page);
      });

      expect(chunks).toHaveLength(3);
      expect(pages).toEqual([1, 2, 3]);
    });

    it('should stop when callback returns false', async () => {
      ctx.count = vi.fn().mockResolvedValue(100);

      const chunks: { id: number; name: string }[][] = [];

      await chunk(ctx, state, 20, async (items, page) => {
        chunks.push(items);
        if (page >= 2) {
          return false;
        }
      });

      expect(chunks).toHaveLength(2);
    });

    it('should stop when no more results', async () => {
      ctx.count = vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(10);
      ctx.execute = vi
        .fn()
        .mockResolvedValueOnce({
          rows: Array.from({ length: 10 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })),
          rowCount: 10,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 0,
          fields: [],
        });

      const chunks: { id: number; name: string }[][] = [];

      await chunk(ctx, state, 20, async (items) => {
        chunks.push(items);
      });

      expect(chunks).toHaveLength(1);
    });
  });
});
