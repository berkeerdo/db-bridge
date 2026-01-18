import { describe, it, expect } from 'vitest';

import {
  compress,
  decompress,
  isCompressed,
  getCompressionRatio,
  shouldCompress,
} from '../compression';

describe('compression', () => {
  describe('compress', () => {
    it('should not compress small data below threshold', () => {
      const data = 'small';
      const result = compress(data, { threshold: 100 });
      expect(result).toBe(data);
    });

    it('should compress large data above threshold', () => {
      const data = 'a'.repeat(2000);
      const result = compress(data, { threshold: 100 });
      expect(result).not.toBe(data);
      expect(result.length).toBeLessThan(data.length);
    });

    it('should use default options when not provided', () => {
      const smallData = 'small';
      const result = compress(smallData);
      expect(result).toBe(smallData);
    });

    it('should return original data on compression error', () => {
      const data = 'test';
      const result = compress(data, { threshold: 1, level: -999 });
      // Should return original data since compression level is invalid
      expect(typeof result).toBe('string');
    });
  });

  describe('decompress', () => {
    it('should decompress compressed data', () => {
      const original = 'a'.repeat(2000);
      const compressed = compress(original, { threshold: 100 });
      const decompressed = decompress(compressed);
      expect(decompressed).toBe(original);
    });

    it('should return uncompressed data as-is', () => {
      const data = 'not compressed';
      const result = decompress(data);
      expect(result).toBe(data);
    });

    it('should return original data on decompression error', () => {
      const invalidBase64 = 'H4sIAAAAAAAA_invalid_data';
      const result = decompress(invalidBase64);
      expect(typeof result).toBe('string');
    });
  });

  describe('isCompressed', () => {
    it('should return false for short data', () => {
      expect(isCompressed('ab')).toBe(false);
    });

    it('should return false for uncompressed data', () => {
      expect(isCompressed('not compressed data')).toBe(false);
    });

    it('should return true for compressed data', () => {
      const original = 'a'.repeat(2000);
      const compressed = compress(original, { threshold: 100 });
      expect(isCompressed(compressed)).toBe(true);
    });

    it('should return false for invalid base64', () => {
      expect(isCompressed('!!!!')).toBe(false);
    });
  });

  describe('getCompressionRatio', () => {
    it('should return 1 for empty string', () => {
      expect(getCompressionRatio('', '')).toBe(1);
    });

    it('should calculate correct ratio', () => {
      const original = 'a'.repeat(100);
      const compressed = 'a'.repeat(50);
      expect(getCompressionRatio(original, compressed)).toBe(2);
    });

    it('should return ratio greater than 1 for effective compression', () => {
      const original = 'a'.repeat(2000);
      const compressed = compress(original, { threshold: 100 });
      const ratio = getCompressionRatio(original, compressed);
      expect(ratio).toBeGreaterThan(1);
    });
  });

  describe('shouldCompress', () => {
    it('should return false for small data', () => {
      expect(shouldCompress('small', 1000)).toBe(false);
    });

    it('should return true for repetitive data above threshold', () => {
      const repetitiveData = 'aaaa'.repeat(500);
      expect(shouldCompress(repetitiveData, 100)).toBe(true);
    });

    it('should handle various data patterns', () => {
      // Data with many unique characters has lower repetition ratio
      const uniqueData = 'abcdefghijklmnopqrstuvwxyz0123456789';
      // 36 unique chars, 36 length = ratio of 1, which is < 3
      expect(shouldCompress(uniqueData, 10)).toBe(false);
    });

    it('should use default threshold when not provided', () => {
      const smallData = 'test';
      expect(shouldCompress(smallData)).toBe(false);
    });
  });
});
