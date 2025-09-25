import * as crypto from 'crypto';

/**
 * Simple Crypto class for encryption/decryption
 */
export class Crypto {
  private algorithm: string;
  private key: Buffer;

  constructor(key: string, algorithm = 'aes-256-gcm') {
    this.algorithm = algorithm;
    // Ensure key is 32 bytes for AES-256
    this.key = crypto.scryptSync(key, 'salt', 32);
  }

  encrypt(text: any): string {
    const textStr = typeof text === 'string' ? text : JSON.stringify(text);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    
    let encrypted = cipher.update(textStr, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = (cipher as any).getAuthTag ? (cipher as any).getAuthTag() : null;
    
    return JSON.stringify({
      iv: iv.toString('hex'),
      authTag: authTag?.toString('hex'),
      encrypted: encrypted
    });
  }

  decrypt(encryptedData: string): any {
    const data = JSON.parse(encryptedData);
    const iv = Buffer.from(data.iv, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    
    if (data.authTag && (decipher as any).setAuthTag) {
      (decipher as any).setAuthTag(Buffer.from(data.authTag, 'hex'));
    }
    
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  }

  hash(data: string, algorithm: 'sha256' | 'sha512' | 'md5' = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }
}