import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * scrypt parameters recommended by OWASP (N=2^17, r=8, p=1). They are stored
 * in every hash, so they can be raised later without breaking old hashes.
 */
const PARAMS = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** scrypt needs 128 * N * r bytes; Node's default limit (32 MiB) is too low. */
const MAX_MEMORY = 256 * 1024 * 1024;

function derive(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...params, maxmem: MAX_MEMORY },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

/** `scrypt$N$r$p$<salt>$<hash>` with base64url salt and hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, PARAMS);
  const { N, r, p } = PARAMS;
  return [
    'scrypt',
    N,
    r,
    p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/** Constant-time comparison; a malformed stored hash never matches. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algorithm, N, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A random password for a new user or a reset: 16 URL-safe characters. */
export function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same time as a real check, for logins with an unknown email or a
 * disabled user, so response time does not reveal which emails exist.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummyHash);
  return false;
}
