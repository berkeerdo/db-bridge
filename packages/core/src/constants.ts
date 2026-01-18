/**
 * Constants
 *
 * Centralized configuration constants to eliminate magic numbers.
 * All timing values are in milliseconds unless otherwise noted.
 */

// ============ Connection Defaults ============

export const CONNECTION_DEFAULTS = {
  /** Default MySQL port */
  MYSQL_PORT: 3306,
  /** Default PostgreSQL port */
  POSTGRESQL_PORT: 5432,
  /** Default Redis port */
  REDIS_PORT: 6379,
  /** Default MongoDB port */
  MONGODB_PORT: 27_017,
  /** Default connection timeout (10 seconds) */
  CONNECTION_TIMEOUT: 10_000,
  /** Default idle timeout (5 minutes) */
  IDLE_TIMEOUT: 300_000,
  /** Maximum port number */
  MAX_PORT: 65_535,
  /** Minimum port number */
  MIN_PORT: 1,
} as const;

// ============ Pool Defaults ============

/**
 * Legacy pool defaults (CAPS format)
 * @deprecated Use POOL_DEFAULTS instead
 */
export const POOL_DEFAULTS_LEGACY = {
  /** Minimum connections in pool */
  MIN_CONNECTIONS: 2,
  /** Maximum connections in pool */
  MAX_CONNECTIONS: 10,
  /** Time to wait for a connection (30 seconds) */
  ACQUIRE_TIMEOUT: 30_000,
  /** Time before idle connection is closed (1 minute) */
  IDLE_TIMEOUT: 60_000,
  /** Maximum connection lifetime (30 minutes) */
  MAX_LIFETIME: 1_800_000,
  /** Queue limit (0 = unlimited) */
  QUEUE_LIMIT: 0,
} as const;

/**
 * Production-ready pool defaults
 * Matches PoolConfig interface for easy spreading
 *
 * @example
 * ```typescript
 * const poolConfig = {
 *   ...POOL_DEFAULTS,
 *   max: 20, // Override specific values
 * };
 * ```
 */
export const POOL_DEFAULTS = {
  /** Minimum connections in pool */
  min: 0,
  /** Maximum connections in pool */
  max: 10,
  /** Time to wait for connection from pool (30 seconds) */
  acquireTimeout: 30_000,
  /** Time before idle connection is closed (1 minute) */
  idleTimeout: 60_000,
  /**
   * Maximum waiting requests in queue
   * 100 = prevent memory exhaustion under load
   */
  queueLimit: 100,
  /** Query execution timeout (30 seconds) */
  queryTimeout: 30_000,
} as const;

// ============ Query Defaults ============

export const QUERY_DEFAULTS = {
  /** Default query timeout (30 seconds) */
  TIMEOUT: 30_000,
  /** Transaction timeout (1 minute) */
  TRANSACTION_TIMEOUT: 60_000,
  /** Slow query threshold (1 second) */
  SLOW_QUERY_THRESHOLD: 1000,
  /** Maximum traces to keep in memory */
  MAX_TRACES: 10_000,
  /** Very slow query threshold for analysis (2 seconds) */
  VERY_SLOW_QUERY_THRESHOLD: 2000,
  /** Slow transaction threshold (5 seconds) */
  SLOW_TRANSACTION_THRESHOLD: 5000,
} as const;

// ============ Cache Defaults ============

export const CACHE_DEFAULTS = {
  /** Default cache TTL (1 hour in seconds) */
  TTL_SECONDS: 3600,
  /** Default cache TTL (1 hour in milliseconds) */
  TTL_MS: 3_600_000,
  /** Short TTL for errors (1 minute in seconds) */
  ERROR_TTL_SECONDS: 60,
  /** Cache cleanup interval (1 minute) */
  CLEANUP_INTERVAL: 60_000,
  /** Maximum cache entry size (1MB) */
  MAX_ENTRY_SIZE: 1024 * 1024,
  /** Compression threshold (1KB) */
  COMPRESSION_THRESHOLD: 1024,
  /** Maximum latencies to track for cache statistics */
  MAX_LATENCIES: 1000,
} as const;

// ============ Retry Defaults ============

export const RETRY_DEFAULTS = {
  /** Maximum retry attempts */
  MAX_RETRIES: 3,
  /** Base delay between retries (1 second) */
  BASE_DELAY: 1000,
  /** Maximum delay between retries (30 seconds) */
  MAX_DELAY: 30_000,
  /** Backoff multiplier */
  BACKOFF_MULTIPLIER: 2,
  /** Circuit breaker failure threshold */
  CIRCUIT_BREAKER_THRESHOLD: 5,
  /** Circuit breaker reset timeout (30 seconds) */
  CIRCUIT_BREAKER_RESET: 30_000,
} as const;

// ============ Crypto Defaults ============

export const CRYPTO_DEFAULTS = {
  /** Default encryption algorithm */
  ALGORITHM: 'aes-256-gcm',
  /** Default key length (32 bytes for AES-256) */
  KEY_LENGTH: 32,
  /** Default IV length (16 bytes) */
  IV_LENGTH: 16,
  /** ChaCha20 IV length (12 bytes) */
  CHACHA_IV_LENGTH: 12,
  /** Default salt length (32 bytes) */
  SALT_LENGTH: 32,
  /** PBKDF2 iterations */
  ITERATIONS: 100_000,
  /** Hash digest algorithm */
  DIGEST: 'sha256',
} as const;

// ============ Health Check Defaults ============

export const HEALTH_DEFAULTS = {
  /** Health check interval (30 seconds) */
  CHECK_INTERVAL: 30_000,
  /** Health check timeout (5 seconds) */
  CHECK_TIMEOUT: 5000,
  /** Maximum wait time for healthy state (1 minute) */
  MAX_WAIT_TIME: 60_000,
  /** Wait interval between health checks (1 second) */
  WAIT_INTERVAL: 1000,
} as const;

// ============ Logging Defaults ============

export const LOGGING_DEFAULTS = {
  /** Slow query threshold for logging (1 second) */
  SLOW_QUERY_THRESHOLD: 1000,
  /** Maximum SQL length in logs (200 chars) */
  MAX_SQL_LENGTH: 200,
  /** Maximum params length in logs (100 chars) */
  MAX_PARAMS_LENGTH: 100,
} as const;

// ============ Metrics Buckets ============

/**
 * Histogram buckets for query duration metrics (in ms)
 */
export const DURATION_BUCKETS = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10_000] as const;

// ============ Performance Analysis Duration ============

export const ANALYSIS_DEFAULTS = {
  /** Default analysis window (1 hour) */
  WINDOW: 3_600_000,
  /** Warmup delay after connection (1 second) */
  WARMUP_DELAY: 1000,
} as const;

// ============ Unit Conversions ============

export const TIME_UNITS = {
  /** Milliseconds in a second */
  MS_PER_SECOND: 1000,
  /** Milliseconds in a minute */
  MS_PER_MINUTE: 60_000,
  /** Milliseconds in an hour */
  MS_PER_HOUR: 3_600_000,
  /** Seconds in a minute */
  SECONDS_PER_MINUTE: 60,
  /** Seconds in an hour */
  SECONDS_PER_HOUR: 3600,
} as const;

export const SIZE_UNITS = {
  /** Bytes in a kilobyte */
  BYTES_PER_KB: 1024,
  /** Bytes in a megabyte */
  BYTES_PER_MB: 1024 * 1024,
  /** Bytes in a gigabyte */
  BYTES_PER_GB: 1024 * 1024 * 1024,
} as const;
