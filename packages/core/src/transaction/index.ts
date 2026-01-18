/**
 * Transaction Module
 *
 * Provides base transaction class for database adapters.
 * Each adapter extends BaseTransaction with database-specific implementations.
 *
 * @module transaction
 */

export { BaseTransaction, type TransactionConnection } from './base-transaction';
