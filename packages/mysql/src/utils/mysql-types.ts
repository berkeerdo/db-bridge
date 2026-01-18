import type { FieldPacket } from 'mysql2';

export const MYSQL_TYPE_MAP: Record<number, string> = {
  0: 'DECIMAL',
  1: 'TINY',
  2: 'SHORT',
  3: 'LONG',
  4: 'FLOAT',
  5: 'DOUBLE',
  6: 'NULL',
  7: 'TIMESTAMP',
  8: 'LONGLONG',
  9: 'INT24',
  10: 'DATE',
  11: 'TIME',
  12: 'DATETIME',
  13: 'YEAR',
  14: 'NEWDATE',
  15: 'VARCHAR',
  16: 'BIT',
  245: 'JSON',
  246: 'NEWDECIMAL',
  247: 'ENUM',
  248: 'SET',
  249: 'TINY_BLOB',
  250: 'MEDIUM_BLOB',
  251: 'LONG_BLOB',
  252: 'BLOB',
  253: 'VAR_STRING',
  254: 'STRING',
  255: 'GEOMETRY',
};

export function getMySQLType(field: FieldPacket): string {
  return MYSQL_TYPE_MAP[field.type as number] || 'UNKNOWN';
}

export function isBinaryType(field: FieldPacket): boolean {
  const binaryTypes = [249, 250, 251, 252]; // BLOB types
  return binaryTypes.includes(field.type as number);
}

export function isNumericType(field: FieldPacket): boolean {
  const numericTypes = [0, 1, 2, 3, 4, 5, 8, 9, 246]; // Numeric types
  return numericTypes.includes(field.type as number);
}

export function isDateType(field: FieldPacket): boolean {
  const dateTypes = [7, 10, 11, 12, 13, 14]; // Date/time types
  return dateTypes.includes(field.type as number);
}

export function isTextType(field: FieldPacket): boolean {
  const textTypes = [15, 253, 254]; // String types
  return textTypes.includes(field.type as number);
}

export function formatMySQLValue(value: unknown, field?: FieldPacket): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (field && isDateType(field)) {
    return value instanceof Date ? value : new Date(value as string);
  }

  if (field && isBinaryType(field)) {
    return Buffer.isBuffer(value) ? value : Buffer.from(value as string);
  }

  return value;
}

export interface MySQLConnectionOptions {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  charset?: string;
  timezone?: string;
  connectTimeout?: number;
  ssl?: {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
  };
  multipleStatements?: boolean;
  dateStrings?: boolean;
  supportBigNumbers?: boolean;
  bigNumberStrings?: boolean;
  decimalNumbers?: boolean;
}

export interface MySQLPoolOptions extends MySQLConnectionOptions {
  connectionLimit?: number;
  queueLimit?: number;
  waitForConnections?: boolean;
  acquireTimeout?: number;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
}
