import { randomBytes, createHash, timingSafeEqual } from 'crypto';

// SHA-256 is correct for high-entropy random tokens (32 bytes = 256 bits of entropy).
// bcrypt is intentionally slow and designed for low-entropy passwords — wrong tool for tokens.
// Verification uses timingSafeEqual to prevent timing attacks.

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex'); // 64-char hex, 256-bit entropy
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function verifyToken(raw: string, storedHash: string): boolean {
  try {
    const computedHash = createHash('sha256').update(raw).digest('hex');
    return timingSafeEqual(
      Buffer.from(computedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}
