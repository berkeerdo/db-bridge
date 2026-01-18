# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security seriously at db-bridge. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send an email to [security@db-bridge.dev](mailto:security@db-bridge.dev) with:
   - A description of the vulnerability
   - Steps to reproduce the issue
   - Potential impact of the vulnerability
   - Any suggested fixes (if available)

2. **GitHub Security Advisories**: Use [GitHub's private vulnerability reporting](https://github.com/berkeerdo/db-bridge/security/advisories/new)

### What to Include

When reporting a vulnerability, please include:

- **Type of vulnerability** (e.g., SQL injection, XSS, authentication bypass)
- **Full paths of source file(s)** related to the vulnerability
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact assessment** of the vulnerability
- **Suggested fix** (if you have one)

### Response Timeline

| Action             | Timeline                                    |
| ------------------ | ------------------------------------------- |
| First Response     | Within 48 hours                             |
| Initial Assessment | Within 1 week                               |
| Fix Development    | Within 2 weeks (critical) / 4 weeks (other) |
| Public Disclosure  | After fix is released                       |

### What to Expect

1. **Acknowledgment**: We will acknowledge receipt of your report within 48 hours.

2. **Assessment**: Our security team will assess the vulnerability and determine its severity using [CVSS](https://www.first.org/cvss/).

3. **Updates**: We will keep you informed of our progress throughout the process.

4. **Fix**: Once a fix is developed, we will:
   - Notify you before public disclosure
   - Credit you in the security advisory (unless you prefer anonymity)
   - Release the fix and publish a security advisory

5. **Recognition**: We appreciate responsible disclosure and will publicly thank you (if desired) in our release notes.

## Security Best Practices

When using db-bridge, follow these security best practices:

### 1. Connection Security

```typescript
// Always use SSL/TLS in production
const db = new DBBridge({
  type: 'postgresql',
  host: 'localhost',
  ssl: {
    enabled: true,
    rejectUnauthorized: true,
    ca: fs.readFileSync('/path/to/ca-cert.pem'),
  },
});
```

### 2. Parameterized Queries

```typescript
// GOOD: Use parameterized queries
const users = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

// BAD: Never concatenate user input
// const users = await db.query(`SELECT * FROM users WHERE id = ${userId}`);
```

### 3. Encryption at Rest

```typescript
// Use built-in encryption for sensitive fields
import { CryptoProvider } from '@db-bridge/core';

const crypto = new CryptoProvider({ key: process.env.ENCRYPTION_KEY });
const encryptedData = crypto.encryptField(sensitiveData);
```

### 4. Connection Pool Security

```typescript
// Limit pool size to prevent resource exhaustion
const db = new DBBridge({
  pool: {
    min: 2,
    max: 10, // Don't set too high
    acquireTimeout: 30000,
    idleTimeout: 60000,
  },
});
```

### 5. Environment Variables

```bash
# Never commit credentials to version control
# Use environment variables instead
DATABASE_HOST=localhost
DATABASE_USER=myuser
DATABASE_PASSWORD=secret
DATABASE_NAME=mydb
ENCRYPTION_KEY=your-32-byte-encryption-key
```

## Known Security Considerations

### SQL Injection Prevention

db-bridge uses parameterized queries by default. The query builder automatically escapes all values:

```typescript
// Safe by default
db.select('users')
  .where('email', '=', userInput) // Automatically parameterized
  .execute();
```

### Sensitive Data Handling

- Connection passwords are never logged
- Query parameters can be masked in logs
- Encryption keys are stored in memory only

### Dependencies

We regularly audit our dependencies using:

- `npm audit`
- GitHub Dependabot
- Snyk (when available)

## Security Updates

Security updates are released as patch versions and announced via:

- GitHub Security Advisories
- Release notes
- npm package updates

Subscribe to our GitHub repository to receive notifications about security updates.

## Bug Bounty Program

Currently, we do not have a formal bug bounty program. However, we deeply appreciate security researchers who help us improve the security of db-bridge.

Responsible disclosure of security vulnerabilities will be acknowledged in our release notes and security advisories.

---

Thank you for helping keep db-bridge and its users safe!
