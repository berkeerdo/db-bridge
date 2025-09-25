import { createHash } from 'crypto';

export function generateCacheKey(
  sql: string,
  params?: unknown[],
  prefix = 'db-bridge',
): string {
  const hash = createHash('sha256');
  hash.update(sql);
  
  if (params && params.length > 0) {
    hash.update(JSON.stringify(params));
  }
  
  return `${prefix}:${hash.digest('hex')}`;
}

export function parseCacheKey(key: string): { prefix: string; hash: string } | null {
  const parts = key.split(':');
  
  if (parts.length !== 2) {
    return null;
  }
  
  return {
    prefix: parts[0]!,
    hash: parts[1]!,
  };
}

export function createCacheKeyPattern(prefix = 'db-bridge', pattern = '*'): string {
  return `${prefix}:${pattern}`;
}

export function sanitizeCacheKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9:_-]/g, '_');
}