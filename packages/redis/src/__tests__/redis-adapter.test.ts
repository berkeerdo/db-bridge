import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { RedisAdapter } from '../adapter/redis-adapter';

// Mock ioredis before importing RedisAdapter
vi.mock('ioredis', () => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    exists: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(3600),
    keys: vi.fn().mockResolvedValue([]),
    ping: vi.fn().mockResolvedValue('PONG'),
    on: vi.fn(function (this: any) {
      return this;
    }),
    status: 'ready',
  };

  return {
    default: vi.fn(() => mockClient),
  };
});

describe('RedisAdapter', () => {
  let adapter: RedisAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new RedisAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Adapter Properties', () => {
    it('should create instance with default options', () => {
      expect(adapter).toBeInstanceOf(RedisAdapter);
    });

    it('should accept custom options', () => {
      const customAdapter = new RedisAdapter({
        keyPrefix: 'custom:',
        ttl: 7200,
        enableCompression: true,
      });

      expect(customAdapter).toBeInstanceOf(RedisAdapter);
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      await expect(adapter.connect()).resolves.toBeUndefined();
    });

    it('should accept connection config', async () => {
      await expect(
        adapter.connect({
          host: 'localhost',
          port: 6379,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('Cache Operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should have get method', () => {
      expect(adapter.get).toBeDefined();
      expect(typeof adapter.get).toBe('function');
    });

    it('should have set method', () => {
      expect(adapter.set).toBeDefined();
      expect(typeof adapter.set).toBe('function');
    });

    it('should have delete method', () => {
      expect(adapter.delete).toBeDefined();
      expect(typeof adapter.delete).toBe('function');
    });

    it('should have exists method', () => {
      expect(adapter.exists).toBeDefined();
      expect(typeof adapter.exists).toBe('function');
    });

    it('should have clear method', () => {
      expect(adapter.clear).toBeDefined();
      expect(typeof adapter.clear).toBe('function');
    });
  });

  describe('Commands Interface', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should expose commands interface', () => {
      expect(adapter.commands).toBeDefined();
    });
  });
});
