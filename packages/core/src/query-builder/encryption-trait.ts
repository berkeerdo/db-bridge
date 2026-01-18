/**
 * Encryption Trait
 *
 * Provides field encryption/decryption for query builders.
 */

import type { CryptoProvider } from '../crypto/crypto';
import type { QueryResult } from '../types';

export interface EncryptionContext {
  crypto?: CryptoProvider;
  encryptedFields: Set<string>;
  decryptedFields: Set<string>;
}

/**
 * Process data for encryption before insert/update
 */
export function processDataForEncryption(
  ctx: EncryptionContext,
  data: Record<string, unknown> | Record<string, unknown>[],
): Record<string, unknown> | Record<string, unknown>[] {
  if (!ctx.crypto || ctx.encryptedFields.size === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((row) => encryptRow(ctx, row));
  }
  return encryptRow(ctx, data);
}

/**
 * Encrypt a single row
 */
export function encryptRow(
  ctx: EncryptionContext,
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (!ctx.crypto) {
    return row;
  }

  const encryptedRow = { ...row };
  for (const field of ctx.encryptedFields) {
    if (field in encryptedRow) {
      encryptedRow[field] = ctx.crypto.encryptField(encryptedRow[field]);
    }
  }
  return encryptedRow;
}

/**
 * Process query results for decryption
 */
export async function processResultsForDecryption<T>(
  ctx: EncryptionContext,
  result: QueryResult<T>,
): Promise<QueryResult<T>> {
  if (!ctx.crypto || ctx.decryptedFields.size === 0) {
    return result;
  }

  const decryptedRows = result.rows.map((row) => {
    const decryptedRow = { ...row } as Record<string, unknown>;
    for (const field of ctx.decryptedFields) {
      if (field in decryptedRow && decryptedRow[field]) {
        try {
          const value = decryptedRow[field];
          if (typeof value === 'string') {
            decryptedRow[field] = ctx.crypto!.decryptField(value);
          }
        } catch {
          // If decryption fails, leave the value as is
        }
      }
    }
    return decryptedRow as T;
  });

  return {
    ...result,
    rows: decryptedRows,
  };
}
