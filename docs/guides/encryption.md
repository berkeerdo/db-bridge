# Encryption Guide

DB Bridge provides built-in encryption support for sensitive data using industry-standard algorithms.

## Basic Setup

```typescript
const db = new DBBridge({
  type: 'mysql',
  connection: config,
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm', // Default
    key: process.env.ENCRYPTION_KEY // 32-byte key
  }
});
```

## Auto-Encryption for Fields

```typescript
const db = new DBBridge({
  encryption: {
    enabled: true,
    key: process.env.ENCRYPTION_KEY,
    fields: ['ssn', 'credit_card', 'medical_record']
  }
});

// These fields are automatically encrypted on insert/update
await db.table('users').insert({
  name: 'John Doe',
  ssn: '123-45-6789', // Auto-encrypted
  email: 'john@email.com' // Not encrypted
});
```

## Encryption Templates

Use different encryption methods for different data types:

```typescript
const db = new DBBridge({
  encryption: {
    enabled: true,
    templates: {
      medical: {
        algorithm: 'aes-256-gcm',
        key: process.env.MEDICAL_KEY,
        fields: ['diagnosis', 'prescription']
      },
      financial: {
        algorithm: 'chacha20-poly1305',
        key: process.env.FINANCIAL_KEY,
        fields: ['account_number', 'balance']
      },
      pii: {
        algorithm: 'aes-256-cbc',
        key: process.env.PII_KEY,
        fields: ['ssn', 'drivers_license']
      }
    }
  }
});

// Use specific template
const encrypted = db.encrypt(data, 'medical');
const decrypted = db.decrypt(encrypted, 'medical');
```

## Manual Encryption

```typescript
// Encrypt any data
const encrypted = db.encrypt({ secret: 'data' });

// Decrypt
const decrypted = db.decrypt(encrypted);

// One-way hashing
const hash = db.hash('password'); // SHA-256 by default
const hash512 = db.hash('password', 'sha512');
```

## Searchable Encryption

For fields that need to be searchable:

```typescript
// Store both hash (for searching) and encrypted value
const email = 'user@example.com';
const emailHash = db.hash(email.toLowerCase());
const emailEncrypted = db.encrypt(email);

await db.table('users').insert({
  email_hash: emailHash,      // For WHERE clauses
  email_encrypted: emailEncrypted, // Actual value
  name: 'John Doe'
});

// Search by email
const searchHash = db.hash('user@example.com'.toLowerCase());
const user = await db.table('users')
  .where('email_hash', searchHash)
  .first();
```

## Key Rotation

```typescript
// Old key
const oldDb = new DBBridge({
  encryption: { key: 'old-key' }
});

// New key
const newDb = new DBBridge({
  encryption: { key: 'new-key' }
});

// Rotation process
const records = await oldDb.table('sensitive_data', {
  decrypt: ['secret_field']
}).get();

for (const record of records) {
  await newDb.table('sensitive_data')
    .where('id', record.id)
    .update({
      secret_field: newDb.encrypt(record.secret_field)
    });
}
```

## Best Practices

1. **Key Management**
   - Store keys in environment variables
   - Use different keys for different data types
   - Rotate keys regularly

2. **Performance**
   - Use caching with encrypted data
   - Consider indexing hash fields for searches

3. **Security**
   - Use AES-256-GCM for most use cases
   - Use ChaCha20-Poly1305 for mobile/IoT
   - Never log encrypted keys

4. **Compliance**
   - GDPR: Encryption helps with data protection
   - PCI DSS: Required for credit card data
   - HIPAA: Required for health information