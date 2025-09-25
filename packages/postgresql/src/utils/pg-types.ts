import { types } from 'pg';

export const PG_TYPE_MAP: Record<number, string> = {
  16: 'bool',
  17: 'bytea',
  18: 'char',
  19: 'name',
  20: 'int8',
  21: 'int2',
  22: 'int2vector',
  23: 'int4',
  24: 'regproc',
  25: 'text',
  26: 'oid',
  27: 'tid',
  28: 'xid',
  29: 'cid',
  30: 'oidvector',
  114: 'json',
  142: 'xml',
  194: 'pg_node_tree',
  600: 'point',
  601: 'lseg',
  602: 'path',
  603: 'box',
  604: 'polygon',
  628: 'line',
  700: 'float4',
  701: 'float8',
  702: 'abstime',
  703: 'reltime',
  704: 'tinterval',
  705: 'unknown',
  718: 'circle',
  790: 'money',
  829: 'macaddr',
  869: 'inet',
  650: 'cidr',
  1000: '_bool',
  1001: '_bytea',
  1002: '_char',
  1003: '_name',
  1005: '_int2',
  1006: '_int2vector',
  1007: '_int4',
  1008: '_regproc',
  1009: '_text',
  1014: '_bpchar',
  1015: '_varchar',
  1016: '_int8',
  1021: '_float4',
  1022: '_float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1115: '_timestamp',
  1182: '_date',
  1183: '_time',
  1184: 'timestamptz',
  1185: '_timestamptz',
  1186: 'interval',
  1187: '_interval',
  1231: '_numeric',
  1263: '_cstring',
  1266: 'timetz',
  1270: '_timetz',
  1560: 'bit',
  1561: '_bit',
  1562: 'varbit',
  1563: '_varbit',
  1700: 'numeric',
  2201: '_refcursor',
  2202: 'regprocedure',
  2203: 'regoper',
  2204: 'regoperator',
  2205: 'regclass',
  2206: 'regtype',
  2950: 'uuid',
  3802: 'jsonb',
  3807: '_jsonb',
};

export function getPgType(oid: number): string {
  return PG_TYPE_MAP[oid] || 'unknown';
}

export function isArrayType(oid: number): boolean {
  const typeName = PG_TYPE_MAP[oid];
  return typeName ? typeName.startsWith('_') : false;
}

export function isBinaryType(oid: number): boolean {
  return oid === 17; // bytea
}

export function isNumericType(oid: number): boolean {
  const numericTypes = [20, 21, 23, 700, 701, 790, 1700]; // int8, int2, int4, float4, float8, money, numeric
  return numericTypes.includes(oid);
}

export function isDateType(oid: number): boolean {
  const dateTypes = [702, 703, 704, 1082, 1083, 1114, 1184, 1186, 1266]; // date/time types
  return dateTypes.includes(oid);
}

export function isTextType(oid: number): boolean {
  const textTypes = [18, 19, 25, 1042, 1043]; // char, name, text, bpchar, varchar
  return textTypes.includes(oid);
}

export function isJsonType(oid: number): boolean {
  return oid === 114 || oid === 3802; // json, jsonb
}

export interface PgConnectionOptions {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean | {
    rejectUnauthorized?: boolean;
    ca?: string;
    key?: string;
    cert?: string;
  };
  connectionTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  max?: number;
  min?: number;
  application_name?: string;
  statement_timeout?: number;
  query_timeout?: number;
  idle_in_transaction_session_timeout?: number;
}

export interface PgPoolOptions extends PgConnectionOptions {
  max?: number;
  min?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  allowExitOnIdle?: boolean;
}

export interface PgTypeParser {
  (value: string): any;
}

export function setupCustomTypeParsers(): void {
  // Parse bigint as string to avoid precision loss
  types.setTypeParser(types.builtins.INT8, (val: string) => {
    const num = parseInt(val, 10);
    return Number.isSafeInteger(num) ? num : val;
  });

  // Parse numeric as number (be careful with precision)
  types.setTypeParser(types.builtins.NUMERIC, parseFloat);

  // Parse money as number
  types.setTypeParser(types.builtins.MONEY, (val: string) => {
    return parseFloat(val.replace(/[^0-9.-]/g, ''));
  });

  // Keep dates as Date objects
  types.setTypeParser(types.builtins.DATE, (val: string) => new Date(val + 'T00:00:00Z'));
  types.setTypeParser(types.builtins.TIMESTAMP, (val: string) => new Date(val + 'Z'));
  types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: string) => new Date(val));

  // Parse arrays - using numeric type IDs directly
  // INT4_ARRAY = 1007
  types.setTypeParser(1007 as any, (val: string) => {
    return types.arrayParser(val, parseInt);
  });

  // TEXT_ARRAY = 1009
  types.setTypeParser(1009 as any, (val: string) => {
    return types.arrayParser(val, (v) => v);
  });
}