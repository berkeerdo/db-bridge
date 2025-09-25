export class DatabaseError extends Error {
  constructor(message: string, public code?: string, public override cause?: Error) {
    super(message);
    this.name = 'DatabaseError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class DBBridgeError extends DatabaseError {
  constructor(message: string, public override code?: string, public override cause?: Error) {
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
  constructor(message: string, public transactionId?: string, cause?: Error) {
    super(message, 'TRANSACTION_ERROR', cause);
    this.name = 'TransactionError';
  }
}

export class TimeoutError extends DBBridgeError {
  constructor(message: string, public timeout?: number, cause?: Error) {
    super(message, 'TIMEOUT_ERROR', cause);
    this.name = 'TimeoutError';
  }
}

export class ValidationError extends DBBridgeError {
  constructor(message: string, public field?: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class CacheError extends DBBridgeError {
  constructor(message: string, public key?: string, cause?: Error) {
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