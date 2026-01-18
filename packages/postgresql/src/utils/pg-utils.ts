export function parsePgConnectionString(connectionString: string): Record<string, any> {
  const url = new URL(connectionString);
  const config: Record<string, any> = {
    host: url.hostname,
    port: Number.parseInt(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  };

  // Parse query parameters
  url.searchParams.forEach((value, key) => {
    switch (key) {
      case 'ssl':
      case 'sslmode': {
        if (value === 'require' || value === 'true' || value === '1') {
          config['ssl'] = true;
        } else if (value === 'disable' || value === 'false' || value === '0') {
          config['ssl'] = false;
        } else {
          config['ssl'] = { rejectUnauthorized: value === 'verify-full' };
        }

        break;
      }
      case 'application_name': {
        config['application_name'] = value;

        break;
      }
      case 'connect_timeout': {
        config['connectionTimeoutMillis'] = Number.parseInt(value) * 1000;

        break;
      }
      default: {
        config[key] = value;
      }
    }
  });

  return config;
}

export function buildPgConnectionString(config: Record<string, any>): string {
  const params = new URLSearchParams();

  // Add SSL mode
  if (config['ssl'] === true) {
    params.append('sslmode', 'require');
  } else if (config['ssl'] === false) {
    params.append('sslmode', 'disable');
  } else if (config['ssl']?.rejectUnauthorized === false) {
    params.append('sslmode', 'prefer');
  }

  // Add other parameters
  if (config['application_name']) {
    params.append('application_name', config['application_name']);
  }
  if (config['connectionTimeoutMillis']) {
    params.append('connect_timeout', String(Math.floor(config['connectionTimeoutMillis'] / 1000)));
  }
  if (config['statement_timeout']) {
    params.append('statement_timeout', String(config['statement_timeout']));
  }

  const auth = config['user']
    ? `${encodeURIComponent(config['user'])}:${encodeURIComponent(config['password'] || '')}@`
    : '';
  const query = params.toString() ? `?${params.toString()}` : '';

  return `postgresql://${auth}${config['host']}:${config['port'] || 5432}/${config['database']}${query}`;
}

export function escapePg(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new TypeError('Cannot escape non-finite numbers');
    }
    return String(value);
  }

  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `'\\x${value.toString('hex')}'`;
  }

  if (Array.isArray(value)) {
    return `ARRAY[${value.map(escapePg).join(', ')}]`;
  }

  if (typeof value === 'object') {
    return escapePg(JSON.stringify(value));
  }

  // String escaping
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function formatPgArray(values: unknown[]): string {
  return `{${values
    .map((v) => {
      if (v === null) {
        return 'NULL';
      }
      if (typeof v === 'string') {
        return `"${v.replaceAll('"', '\\"')}"`;
      }
      return String(v);
    })
    .join(',')}}`;
}

export function parsePgArray(str: string): unknown[] {
  if (!str || str === '{}') {
    return [];
  }

  // Remove outer braces
  str = str.slice(1, -1);

  const result: unknown[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;

  for (const char of str) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"' && !escaped) {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(parsePgValue(current.trim()));
      current = '';
      continue;
    }

    current += char;
  }

  if (current) {
    result.push(parsePgValue(current.trim()));
  }

  return result;
}

function parsePgValue(str: string): unknown {
  if (str === 'NULL') {
    return null;
  }
  if (str === 't' || str === 'true') {
    return true;
  }
  if (str === 'f' || str === 'false') {
    return false;
  }

  // Try to parse as number
  const num = Number(str);
  if (!isNaN(num) && str !== '') {
    return num;
  }

  return str;
}

export function parsePgError(error: any): {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  severity?: string;
  isRetryable: boolean;
} {
  const code = error.code || 'UNKNOWN';
  const message = error.message || 'Unknown error';

  // PostgreSQL error details
  const detail = error.detail;
  const hint = error.hint;
  const position = error.position;
  const severity = error.severity;

  // Determine if error is retryable
  const retryableCodes = [
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '08001', // sqlclient_unable_to_establish_sqlconnection
    '08004', // sqlserver_rejected_establishment_of_sqlconnection
    '40001', // serialization_failure
    '40P01', // deadlock_detected
    '55P03', // lock_not_available
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
    '58000', // system_error
    '58030', // io_error
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ENOTFOUND',
  ];

  const isRetryable =
    retryableCodes.includes(code) ||
    code.startsWith('08') || // Connection errors
    code.startsWith('40') || // Transaction errors
    code.startsWith('57') || // Operator intervention
    code.startsWith('58'); // System errors

  return { code, message, detail, hint, position, severity, isRetryable };
}

export function normalizePgConfig(config: any): any {
  const normalized = { ...config };

  // Normalize boolean values
  if (typeof normalized.ssl === 'string') {
    normalized.ssl =
      normalized.ssl === 'true' || normalized.ssl === '1' || normalized.ssl === 'require';
  }

  // Normalize numeric values
  if (typeof normalized.port === 'string') {
    normalized.port = Number.parseInt(normalized.port);
  }
  if (typeof normalized.max === 'string') {
    normalized.max = Number.parseInt(normalized.max);
  }
  if (typeof normalized.connectionTimeoutMillis === 'string') {
    normalized.connectionTimeoutMillis = Number.parseInt(normalized.connectionTimeoutMillis);
  }
  if (typeof normalized.idleTimeoutMillis === 'string') {
    normalized.idleTimeoutMillis = Number.parseInt(normalized.idleTimeoutMillis);
  }

  // Set defaults
  normalized.port = normalized.port || 5432;
  normalized.max = normalized.max || 10;
  normalized.min = normalized.min || 0;
  normalized.connectionTimeoutMillis = normalized.connectionTimeoutMillis || 30000;
  normalized.idleTimeoutMillis = normalized.idleTimeoutMillis || 10000;
  normalized.application_name = normalized.application_name || 'db-bridge';

  return normalized;
}

export function getPostgreSQLVersion(versionString: string): {
  major: number;
  minor: number;
  patch: number;
  full: string;
} {
  const match = versionString.match(/(\d+)\.(\d+)(?:\.(\d+))?/);

  if (!match) {
    return { major: 0, minor: 0, patch: 0, full: versionString };
  }

  return {
    major: Number.parseInt(match[1] || '0'),
    minor: Number.parseInt(match[2] || '0'),
    patch: Number.parseInt(match[3] || '0'),
    full: versionString,
  };
}
