# Encryption Guide

DB Bridge provides comprehensive encryption features to protect sensitive data in your databases. This guide covers all encryption capabilities including field-level encryption, bulk operations, and various encryption algorithms.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Basic Usage](#basic-usage)
- [Encryption Algorithms](#encryption-algorithms)
- [Field-Level Encryption](#field-level-encryption)
- [Bulk Operations](#bulk-operations)
- [Password Hashing](#password-hashing)
- [Direct Encryption API](#direct-encryption-api)
- [Best Practices](#best-practices)
- [Security Considerations](#security-considerations)

## Overview

DB Bridge's encryption features include:

- **Field-level encryption**: Encrypt specific database columns transparently
- **Multiple algorithms**: Support for AES, ChaCha20, and more
- **Automatic encryption/decryption**: Seamless integration with query builders
- **Password hashing**: One-way hashing for password storage
- **Key management**: Flexible key configuration options
- **Performance optimized**: Minimal overhead for encryption operations

## Setup

### Basic Setup

```typescript
import { MySQLAdapter, CryptoProvider } from '@db-bridge/core';

// Create a crypto provider with default settings (AES-256-GCM)
const crypto = new CryptoProvider();

// Create adapter with encryption support
const adapter = new MySQLAdapter({
  crypto,
  logger: console,
});
```

### Custom Configuration

```typescript
import { CryptoProvider, CryptoAlgorithms } from '@db-bridge/core';

const crypto = new CryptoProvider({
  algorithm: CryptoAlgorithms.AES_256_GCM,  // Encryption algorithm
  keyLength: 32,                            // Key length in bytes
  ivLength: 16,                             // IV length in bytes
  saltLength: 32,                           // Salt length in bytes
  iterations: 100000,                       // PBKDF2 iterations
  digest: 'sha256',                         // Hash digest algorithm
});
```

### Setting Encryption Keys

```typescript
// Option 1: Environment variable (recommended for production)
process.env['DB_BRIDGE_ENCRYPTION_KEY'] = 'your-secret-key';

// Option 2: Generate a random key
const crypto = new CryptoProvider();
const key = crypto.generateKey();
process.env['DB_BRIDGE_ENCRYPTION_KEY'] = key;

// Option 3: Pass key directly (not recommended for production)
const encryptedData = crypto.encrypt('data', { key: 'hex-encoded-key' });
```

## Basic Usage

### Encrypting Data on Insert

```typescript
// Single record insert with encryption
await adapter
  .createQueryBuilder()
  .insert('users', {
    username: 'john_doe',
    email: 'john@example.com',
    ssn: '123-45-6789',           // Will be encrypted
    credit_card: '4111111111111111', // Will be encrypted
  })
  .encrypt('ssn', 'credit_card')   // Specify fields to encrypt
  .execute();
```

### Decrypting Data on Query

```typescript
// Query with automatic decryption
const users = await adapter
  .createQueryBuilder()
  .select('*')
  .from('users')
  .where({ username: 'john_doe' })
  .decrypt('ssn', 'credit_card')   // Specify fields to decrypt
  .execute();

console.log(users.rows[0].ssn); // Decrypted value: "123-45-6789"
```

### Updating Encrypted Fields

```typescript
await adapter
  .createQueryBuilder()
  .update('users', {
    ssn: '987-65-4321',
    credit_card: '5555555555554444',
  })
  .encrypt('ssn', 'credit_card')
  .where({ id: userId })
  .execute();
```

## Encryption Algorithms

DB Bridge supports multiple encryption algorithms:

```typescript
import { CryptoAlgorithms } from '@db-bridge/core';

// AES with Galois/Counter Mode (recommended)
const aesGcm = new CryptoProvider({
  algorithm: CryptoAlgorithms.AES_256_GCM,
});

// AES with Cipher Block Chaining
const aesCbc = new CryptoProvider({
  algorithm: CryptoAlgorithms.AES_256_CBC,
});

// ChaCha20-Poly1305 (modern alternative to AES)
const chaCha = new CryptoProvider({
  algorithm: CryptoAlgorithms.CHACHA20_POLY1305,
});

// Different key sizes
const aes128 = new CryptoProvider({
  algorithm: CryptoAlgorithms.AES_128_GCM,
  keyLength: 16, // 128 bits
});
```

## Field-Level Encryption

### Encrypting Complex Data Types

```typescript
// Encrypt JSON objects
await adapter
  .createQueryBuilder()
  .insert('user_profiles', {
    user_id: 123,
    preferences: { theme: 'dark', language: 'en' }, // JSON object
    tags: ['vip', 'premium'],                       // Array
    metadata: new Date(),                           // Date
  })
  .encrypt('preferences', 'tags', 'metadata')
  .execute();

// Decrypt and restore original types
const profile = await adapter
  .createQueryBuilder()
  .select('*')
  .from('user_profiles')
  .where({ user_id: 123 })
  .decrypt('preferences', 'tags', 'metadata')
  .first();

console.log(profile.preferences); // { theme: 'dark', language: 'en' }
console.log(profile.tags);        // ['vip', 'premium']
```

### Selective Field Encryption

```typescript
// Only encrypt sensitive fields
const userData = {
  // Public fields (not encrypted)
  username: 'john_doe',
  created_at: new Date(),
  is_active: true,
  
  // Sensitive fields (encrypted)
  ssn: '123-45-6789',
  salary: 75000,
  medical_record: { conditions: ['none'] },
};

await adapter
  .createQueryBuilder()
  .insert('employees', userData)
  .encrypt('ssn', 'salary', 'medical_record') // Only these fields encrypted
  .execute();
```

## Bulk Operations

### Bulk Insert with Encryption

```typescript
const records = [
  { name: 'Alice', ssn: '111-11-1111', salary: 50000 },
  { name: 'Bob', ssn: '222-22-2222', salary: 60000 },
  { name: 'Charlie', ssn: '333-33-3333', salary: 70000 },
];

await adapter
  .createQueryBuilder()
  .insert('employees', records)
  .encrypt('ssn', 'salary')
  .execute();
```

### Batch Processing

```typescript
// Process large datasets in batches
const BATCH_SIZE = 1000;
const totalRecords = largeDatasет.length;

for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
  const batch = largeDataset.slice(i, i + BATCH_SIZE);
  
  await adapter
    .createQueryBuilder()
    .insert('sensitive_data', batch)
    .encrypt('field1', 'field2', 'field3')
    .execute();
}
```

## Password Hashing

For passwords, use one-way hashing instead of encryption:

```typescript
const crypto = new CryptoProvider();

// Hash password during registration
const password = 'user-password';
const passwordHash = crypto.hash(password);

await adapter
  .createQueryBuilder()
  .insert('users', {
    username: 'john_doe',
    password_hash: passwordHash, // Store hash, not encrypted password
  })
  .execute();

// Verify password during login
const user = await adapter
  .createQueryBuilder()
  .select('*')
  .from('users')
  .where({ username: 'john_doe' })
  .first();

const isValid = crypto.compareHash('user-password', user.password_hash);
if (isValid) {
  console.log('Login successful');
}
```

## Direct Encryption API

For custom encryption needs outside of database operations:

```typescript
const crypto = new CryptoProvider();

// Encrypt any value
const encrypted = crypto.encryptField({
  user: 'john',
  data: { sensitive: true },
});

// Decrypt
const decrypted = crypto.decryptField(encrypted);

// Manual encrypt/decrypt with full control
const result = crypto.encrypt('sensitive data', {
  key: 'optional-specific-key',
  salt: Buffer.from('optional-salt'),
});

console.log(result); // { encrypted, salt, iv, authTag }

const original = crypto.decrypt(result);
```

## Best Practices

### 1. Key Management

```typescript
// Use environment variables for keys
process.env['DB_BRIDGE_ENCRYPTION_KEY'] = process.env['MASTER_KEY'];

// Rotate keys periodically
const oldCrypto = new CryptoProvider();
const newCrypto = new CryptoProvider();

// Re-encrypt data with new key
const data = await adapter
  .createQueryBuilder()
  .select('id', 'sensitive_field')
  .from('table')
  .decrypt('sensitive_field')
  .execute();

for (const row of data.rows) {
  await adapter
    .createQueryBuilder()
    .update('table', {
      sensitive_field: row.sensitive_field,
    })
    .encrypt('sensitive_field')
    .where({ id: row.id })
    .execute();
}
```

### 2. Performance Optimization

```typescript
// Use prepared statements for repeated operations
const stmt = await adapter.prepare(
  'INSERT INTO users (username, ssn) VALUES (?, ?)'
);

// Encrypt data before binding
const encryptedSsn = crypto.encryptField('123-45-6789');
await stmt.execute(['john_doe', encryptedSsn]);
```

### 3. Error Handling

```typescript
try {
  const result = await adapter
    .createQueryBuilder()
    .select('*')
    .from('users')
    .decrypt('ssn', 'credit_card')
    .execute();
} catch (error) {
  if (error.message.includes('decrypt')) {
    console.error('Decryption failed - possible key mismatch');
  }
  // Handle error appropriately
}
```

## Security Considerations

### 1. Storage Format

Encrypted fields are stored in the format:
```
algorithm:salt:iv:authTag:encryptedData
```

Example:
```
aes-256-gcm:a1b2c3d4...:e5f6g7h8...:i9j0k1l2...:m3n4o5p6...
```

### 2. Database Considerations

- Encrypted fields require more storage space (typically 2-3x original size)
- Use `TEXT` or `VARCHAR` with sufficient length for encrypted columns
- Indexes on encrypted fields won't work for searching
- Consider creating hash columns for searchable encrypted fields

### 3. Migration Considerations

When adding encryption to existing data:

```typescript
// Step 1: Add new encrypted column
await adapter.query('ALTER TABLE users ADD COLUMN ssn_encrypted TEXT');

// Step 2: Encrypt existing data
const users = await adapter.query('SELECT id, ssn FROM users');
for (const user of users.rows) {
  const encrypted = crypto.encryptField(user.ssn);
  await adapter.query(
    'UPDATE users SET ssn_encrypted = ? WHERE id = ?',
    [encrypted, user.id]
  );
}

// Step 3: Drop original column (after verification)
await adapter.query('ALTER TABLE users DROP COLUMN ssn');
```

### 4. Compliance

- Ensure encryption meets your compliance requirements (HIPAA, PCI-DSS, GDPR)
- Document which fields contain encrypted data
- Implement proper key rotation policies
- Maintain audit logs for encryption operations

## Examples

See the [encryption example](../examples/encryption.ts) for a complete working demonstration of all encryption features.