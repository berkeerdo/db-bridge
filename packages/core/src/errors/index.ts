export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'DatabaseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DBBridgeError extends DatabaseError {
  constructor(
    message: string,
    public override code?: string,
    public override cause?: Error,
  ) {
    super(message, code, cause);
    this.name = 'DBBridgeError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConnectionError extends DBBridgeError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DBBridgeError {
  constructor(
    message: string,
    public sql?: string,
    public params?: unknown[],
    cause?: Error,
  ) {
    super(message, 'QUERY_ERROR', cause);
    this.name = 'QueryError';
  }
}

export class TransactionError extends DBBridgeError {
  constructor(
    message: string,
    public transactionId?: string,
    cause?: Error,
  ) {
    super(message, 'TRANSACTION_ERROR', cause);
    this.name = 'TransactionError';
  }
}

export class TimeoutError extends DBBridgeError {
  constructor(
    message: string,
    public timeout?: number,
    cause?: Error,
  ) {
    super(message, 'TIMEOUT_ERROR', cause);
    this.name = 'TimeoutError';
  }
}

/**
 * Thrown when a query exceeds the configured timeout
 */
export class QueryTimeoutError extends TimeoutError {
  constructor(
    public sql: string,
    public timeoutMs: number,
    cause?: Error,
  ) {
    super(
      `Query timed out after ${timeoutMs}ms. Consider optimizing the query or increasing queryTimeout.`,
      timeoutMs,
      cause,
    );
    this.name = 'QueryTimeoutError';
    this.code = 'QUERY_TIMEOUT';
  }
}

/**
 * Thrown when the connection pool is exhausted
 * This happens when:
 * - All connections are busy AND
 * - Queue is full (queueLimit reached) OR
 * - acquireTimeout exceeded
 */
export class PoolExhaustedError extends ConnectionError {
  constructor(
    public poolStats: { active: number; waiting: number; max: number },
    public waitTimeMs?: number,
    cause?: Error,
  ) {
    const { active, waiting, max } = poolStats;
    super(
      `Connection pool exhausted: ${active}/${max} connections active, ${waiting} requests waiting. ` +
        `Consider increasing pool.max or reducing load.`,
      cause,
    );
    this.name = 'PoolExhaustedError';
    this.code = 'POOL_EXHAUSTED';
  }
}

export class ValidationError extends DBBridgeError {
  constructor(
    message: string,
    public field?: string,
    cause?: Error,
  ) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class CacheError extends DBBridgeError {
  constructor(
    message: string,
    public key?: string,
    cause?: Error,
  ) {
    super(message, 'CACHE_ERROR', cause);
    this.name = 'CacheError';
  }
}

export class NotImplementedError extends DBBridgeError {
  constructor(feature: string) {
    super(`Feature "${feature}" is not implemented`, 'NOT_IMPLEMENTED');
    this.name = 'NotImplementedError';
  }
}
