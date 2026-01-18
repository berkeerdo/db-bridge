import { describe, it, expect, beforeEach } from 'vitest';

import {
  whereDate,
  whereYear,
  whereMonth,
  whereDay,
  whereToday,
  whereYesterday,
  whereBetweenDates,
  whereLastDays,
} from '../date-filter-trait';

import type { DateFilterContext } from '../date-filter-trait';

describe('date-filter-trait', () => {
  let ctx: DateFilterContext;

  beforeEach(() => {
    ctx = {
      bindings: [],
      whereClauses: [],
      escapeIdentifierFn: (id) => `"${id}"`,
      parameterPlaceholderFn: (index) => `$${index}`,
    };
  });

  describe('whereDate', () => {
    it('should add date comparison clause with Date object', () => {
      const date = new Date('2024-01-15');
      whereDate(ctx, 'created_at', '=', date);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('DATE("created_at")');
      expect(ctx.whereClauses[0].condition).toContain('$1');
      expect(ctx.bindings).toEqual(['2024-01-15']);
    });

    it('should add date comparison clause with string', () => {
      whereDate(ctx, 'created_at', '>=', '2024-01-01');

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('>=');
      expect(ctx.bindings).toEqual(['2024-01-01']);
    });
  });

  describe('whereYear', () => {
    it('should add year comparison clause', () => {
      whereYear(ctx, 'created_at', '=', 2024);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('YEAR("created_at")');
      expect(ctx.bindings).toEqual([2024]);
    });
  });

  describe('whereMonth', () => {
    it('should add month comparison clause', () => {
      whereMonth(ctx, 'created_at', '=', 6);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('MONTH("created_at")');
      expect(ctx.bindings).toEqual([6]);
    });
  });

  describe('whereDay', () => {
    it('should add day comparison clause', () => {
      whereDay(ctx, 'created_at', '=', 15);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('DAY("created_at")');
      expect(ctx.bindings).toEqual([15]);
    });
  });

  describe('whereToday', () => {
    it('should add today comparison clause', () => {
      whereToday(ctx, 'created_at');

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('DATE("created_at")');
      expect(ctx.bindings).toHaveLength(1);
      // Check that binding is today's date
      const today = new Date().toISOString().split('T')[0];
      expect(ctx.bindings[0]).toBe(today);
    });
  });

  describe('whereYesterday', () => {
    it('should add yesterday comparison clause', () => {
      whereYesterday(ctx, 'created_at');

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.bindings).toHaveLength(1);
      // Check that binding is yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(ctx.bindings[0]).toBe(yesterday.toISOString().split('T')[0]);
    });
  });

  describe('whereBetweenDates', () => {
    it('should add date range clause with Date objects', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31');
      whereBetweenDates(ctx, 'created_at', start, end);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('BETWEEN');
      expect(ctx.bindings).toEqual(['2024-01-01', '2024-12-31']);
    });

    it('should add date range clause with strings', () => {
      whereBetweenDates(ctx, 'created_at', '2024-01-01', '2024-12-31');

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.bindings).toEqual(['2024-01-01', '2024-12-31']);
    });
  });

  describe('whereLastDays', () => {
    it('should add last N days clause', () => {
      whereLastDays(ctx, 'created_at', 7);

      expect(ctx.whereClauses).toHaveLength(1);
      expect(ctx.whereClauses[0].condition).toContain('DATE_SUB');
      expect(ctx.whereClauses[0].condition).toContain('INTERVAL');
      expect(ctx.bindings).toEqual([7]);
    });
  });

  describe('multiple filters', () => {
    it('should accumulate multiple clauses', () => {
      whereYear(ctx, 'created_at', '=', 2024);
      whereMonth(ctx, 'created_at', '>=', 6);

      expect(ctx.whereClauses).toHaveLength(2);
      expect(ctx.bindings).toEqual([2024, 6]);
    });
  });
});
