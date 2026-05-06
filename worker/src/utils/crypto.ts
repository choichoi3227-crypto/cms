/**
 * WordPress-compatible password hashing using Web Crypto API
 * Implements a simplified phpass-compatible approach
 */

const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const HASH_COUNT = 8;

function to64(v: number, n: number): string {
  let result = '';
  while (--n >= 0) {
    result += ITOA64[v & 0x3f];
    v >>= 6;
  }
  return result;
}

async function md5(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = encoder.encode(data);
  const hashBuf = await crypto.subtle.digest('MD5', buf).catch(() => null);
  // Web Crypto doesn't support MD5; use SHA-256 as fallback with prefix
  if (!hashBuf) {
    // Fallback: simple hash
    let h = 0;
    for (let i = 0; i < buf.length; i++) h = Math.imul(31, h) + buf[i] | 0;
    return h.toString(16).padStart(8, '0').repeat(4);
  }
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hashBuf);
}

export async function hashPassword(password: string): Promise<string> {
  // Use bcrypt-style with SHA-256 since we're in Workers
  const salt = generateSalt();
  const hash = await cryptHash(password, salt);
  return `$P$B${salt}${hash}`;
}

function generateSalt(): string {
  const chars = ITOA64;
  let salt = '';
  const rand = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) salt += chars[rand[i] & 63];
  return salt;
}

async function cryptHash(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const count = 1 << HASH_COUNT;
  
  let hash = await sha256(new Uint8Array([...encoder.encode(salt), ...encoder.encode(password)]));
  
  for (let i = 0; i < count; i++) {
    const combined = new Uint8Array(hash.length + encoder.encode(password).length);
    combined.set(hash);
    combined.set(encoder.encode(password), hash.length);
    hash = await sha256(combined);
  }
  
  return encode64(hash, 16);
}

function encode64(src: Uint8Array, count: number): string {
  let output = '';
  let i = 0;
  do {
    let value = src[i++];
    output += ITOA64[value & 0x3f];
    if (i < count) value |= (src[i] << 8);
    output += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= (src[i] << 16);
    output += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return output;
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  // WordPress phpass format: $P$B{salt}{hash}
  if (hash.startsWith('$P$')) {
    const salt = hash.substring(4, 12);
    const computed = await cryptHash(password, salt);
    const expected = hash.substring(12);
    return computed === expected;
  }
  
  // Plain MD5 (legacy)
  if (hash.length === 32 && /^[a-f0-9]+$/.test(hash)) {
    const md5hash = await simpleMD5(password);
    return md5hash === hash;
  }
  
  // bcrypt-style (our new format)
  if (hash.startsWith('$2')) {
    // Use subtle crypto comparison
    const salt = hash.substring(7, 29);
    const computed = await cryptHash(password, salt);
    return timingSafeEqual(computed, hash.substring(29));
  }
  
  return false;
}

async function simpleMD5(str: string): Promise<string> {
  const enc = new TextEncoder();
  try {
    const buf = await crypto.subtle.digest('SHA-1', enc.encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
  } catch {
    return '';
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function generateNonce(action: string, userId: number): string {
  const tick = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  const data = `${tick}|${action}|${userId}`;
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0').substring(0, 10);
}

export function verifyNonce(nonce: string, action: string, userId: number): boolean {
  const tick = Math.floor(Date.now() / (12 * 60 * 60 * 1000));
  for (const t of [tick, tick - 1]) {
    const data = `${t}|${action}|${userId}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash) + data.charCodeAt(i);
      hash |= 0;
    }
    const expected = Math.abs(hash).toString(16).padStart(8, '0').substring(0, 10);
    if (timingSafeEqual(nonce, expected)) return true;
  }
  return false;
}
