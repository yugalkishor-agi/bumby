import * as Crypto from 'expo-crypto';
import { Secret, TOTP } from 'otpauth';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const TOTP_ISSUER = 'Iris';
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

/** RFC 4648 base32 encoding (no padding), as expected by authenticator apps. */
export function bytesToBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i += 1) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/** Cryptographically secure 160-bit base32 secret for authenticator apps. */
export function generateTotpSecret(byteLength = 20): string {
  return bytesToBase32(Crypto.getRandomBytes(byteLength));
}

/** Cryptographically secure, human-friendly backup code. */
export function generateBackupCode(): string {
  const bytes = Crypto.getRandomBytes(10);
  const chars = Array.from(bytes)
    .map((byte) => BASE32_ALPHABET[byte % 32])
    .join('');
  return `${chars.slice(0, 5)}-${chars.slice(5, 10)}`;
}

/**
 * Verifies a 6 digit TOTP code against the stored secret.
 *
 * A one-step window on either side is accepted to tolerate clock drift between
 * the device and the server.
 */
export function verifyTotpToken(secret: string, token: string, window = 1): boolean {
  const trimmed = (token || '').trim();
  if (!secret || !/^\d{6}$/.test(trimmed)) return false;

  try {
    const totp = new TOTP({
      secret: Secret.fromBase32(secret),
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      algorithm: 'SHA1',
    });
    return totp.validate({ token: trimmed, window }) !== null;
  } catch (error) {
    console.error('Failed to verify TOTP token:', error);
    return false;
  }
}

/** `otpauth://` URI that authenticator apps consume. */
export function buildOtpAuthUri(secret: string, accountLabel: string): string {
  const query = [
    `secret=${encodeURIComponent(secret)}`,
    `issuer=${encodeURIComponent(TOTP_ISSUER)}`,
    'algorithm=SHA1',
    `digits=${TOTP_DIGITS}`,
    `period=${TOTP_PERIOD_SECONDS}`,
  ].join('&');
  return `otpauth://totp/${encodeURIComponent(`${TOTP_ISSUER}:${accountLabel}`)}?${query}`;
}
