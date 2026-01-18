/**
 * Compression Utilities
 *
 * Provides compression and decompression for cache entries.
 * Uses zlib for gzip compression.
 */

import { gzipSync, gunzipSync, constants as zlibConstants } from 'node:zlib';

import { CACHE_DEFAULTS } from '../constants';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Minimum size in bytes before compression is applied */
  threshold?: number;
  /** Compression level (1-9, higher = more compression) */
  level?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  threshold: CACHE_DEFAULTS.COMPRESSION_THRESHOLD,
  level: zlibConstants.Z_DEFAULT_COMPRESSION,
};

/**
 * Compress a string if it exceeds the threshold
 */
export function compress(data: string, options: CompressionOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip compression for small data
  if (data.length < opts.threshold) {
    return data;
  }

  try {
    const buffer = Buffer.from(data, 'utf8');
    const compressed = gzipSync(buffer, { level: opts.level });
    return compressed.toString('base64');
  } catch {
    // Return original data if compression fails
    return data;
  }
}

/**
 * Decompress a string if it was compressed
 */
export function decompress(data: string): string {
  if (!isCompressed(data)) {
    return data;
  }

  try {
    const buffer = Buffer.from(data, 'base64');
    const decompressed = gunzipSync(buffer);
    return decompressed.toString('utf8');
  } catch {
    // Return original data if decompression fails
    return data;
  }
}

/**
 * Check if data appears to be gzip compressed (base64 encoded)
 */
export function isCompressed(data: string): boolean {
  if (data.length < 4) {
    return false;
  }

  try {
    // Check if it's valid base64 and starts with gzip magic bytes
    const buffer = Buffer.from(data.slice(0, 4), 'base64');
    return buffer[0] === 0x1f && buffer[1] === 0x8b;
  } catch {
    return false;
  }
}

/**
 * Get compression ratio (original size / compressed size)
 */
export function getCompressionRatio(original: string, compressed: string): number {
  if (original.length === 0) {
    return 1;
  }
  return original.length / compressed.length;
}

/**
 * Estimate if compression would be beneficial
 */
export function shouldCompress(
  data: string,
  threshold = CACHE_DEFAULTS.COMPRESSION_THRESHOLD,
): boolean {
  // Don't compress small data
  if (data.length < threshold) {
    return false;
  }

  // Check for repetitive patterns that compress well
  const uniqueChars = new Set(data).size;
  const repetitionRatio = data.length / uniqueChars;

  // Compress if data has good repetition ratio (> 3)
  return repetitionRatio > 3;
}
