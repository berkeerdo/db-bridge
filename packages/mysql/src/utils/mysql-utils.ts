export function parseMySQLConnectionString(connectionString: string): Record<string, any> {
  const url = new URL(connectionString);
  const config: Record<string, any> = {
    host: url.hostname,
    port: Number.parseInt(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  };

  // Parse query parameters
  url.searchParams.forEach((value, key) => {
    switch (key) {
      case 'ssl': {
        config['ssl'] = value === 'true' || value === '1';

        break;
      }
      case 'charset': {
        config['charset'] = value;

        break;
      }
      case 'timezone': {
        config['timezone'] = value;

        break;
      }
      case 'connectionLimit': {
        config['connectionLimit'] = Number.parseInt(value);

        break;
      }
      default: {
        config[key] = value;
      }
    }
  });

  return config;
}

export function buildMySQLConnectionString(config: Record<string, any>): string {
  const params = new URLSearchParams();

  Object.entries(config).forEach(([key, value]) => {
    if (!['host', 'port', 'user', 'password', 'database'].includes(key)) {
      params.append(key, String(value));
    }
  });

  const auth = config['user']
    ? `${encodeURIComponent(config['user'])}:${encodeURIComponent(config['password'] || '')}@`
    : '';
  const query = params.toString() ? `?${params.toString()}` : '';

  return `mysql://${auth}${config['host']}:${config['port'] || 3306}/${config['database']}${query}`;
}

export function escapeMySQL(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  if (typeof value === 'number') {
    if (!isFinite(value)) {
      throw new TypeError('Cannot escape non-finite numbers');
    }
    return String(value);
  }

  if (value instanceof Date) {
    return `'${formatMySQLDateTime(value)}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  if (Array.isArray(value)) {
    return value.map(escapeMySQL).join(', ');
  }

  if (typeof value === 'object') {
    return escapeMySQL(JSON.stringify(value));
  }

  // String escaping
  return `'${String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\0', '\\0')
    .replaceAll('', '\\Z')}'`;
}

export function formatMySQLDateTime(date: Date): string {
  const pad = (num: number): string => String(num).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

export function formatMySQLDate(date: Date): string {
  const pad = (num: number): string => String(num).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatMySQLTime(date: Date): string {
  const pad = (num: number): string => String(num).padStart(2, '0');

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseMySQLError(error: any): {
  code: string;
  errno: number;
  message: string;
  sqlState?: string;
  isRetryable: boolean;
} {
  const code = error.code || 'UNKNOWN';
  const errno = error.errno || 0;
  const message = error.message || 'Unknown error';
  const sqlState = error.sqlState;

  // Determine if error is retryable
  const retryableCodes = [
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'EPIPE',
    'ENOTFOUND',
    'ENETUNREACH',
    'EAI_AGAIN',
    'ER_LOCK_DEADLOCK',
    'ER_LOCK_WAIT_TIMEOUT',
  ];

  const isRetryable = retryableCodes.includes(code) || (errno >= 2000 && errno <= 2999); // Connection errors

  return { code, errno, message, sqlState, isRetryable };
}

export function normalizeMySQLConfig(config: any): any {
  const normalized = { ...config };

  // Normalize boolean values
  if (typeof normalized.ssl === 'string') {
    normalized.ssl = normalized.ssl === 'true' || normalized.ssl === '1';
  }

  // Normalize numeric values
  if (typeof normalized.port === 'string') {
    normalized.port = Number.parseInt(normalized.port);
  }
  if (typeof normalized.connectionLimit === 'string') {
    normalized.connectionLimit = Number.parseInt(normalized.connectionLimit);
  }
  if (typeof normalized.connectTimeout === 'string') {
    normalized.connectTimeout = Number.parseInt(normalized.connectTimeout);
  }

  // Set defaults
  normalized.port = normalized.port || 3306;
  normalized.charset = normalized.charset || 'utf8mb4';
  normalized.timezone = normalized.timezone || 'local';
  normalized.connectionLimit = normalized.connectionLimit || 10;
  normalized.connectTimeout = normalized.connectTimeout || 10000;

  return normalized;
}
