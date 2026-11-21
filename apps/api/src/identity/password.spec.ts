import {
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from './password.js';

describe('password hashing', () => {
  it('stores scrypt parameters, salt and hash — never the password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^scrypt\$131072\$8\$1\$[\w-]{22}\$[\w-]{43}$/);
    expect(hash).not.toContain('correct horse');
  });

  it('uses a new salt every time', async () => {
    const [a, b] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);

    expect(a).not.toBe(b);
  });

  it('accepts the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('s3cret-Pa55');

    expect(await verifyPassword('s3cret-Pa55', hash)).toBe(true);
    expect(await verifyPassword('s3cret-pa55', hash)).toBe(false);
  });

  it('treats Unicode forms of the same password as equal (NFKC)', async () => {
    const hash = await hashPassword('café'); // é as one code point

    expect(await verifyPassword('café', hash)).toBe(true); // e + combining accent
  });

  it('never matches a malformed stored hash', async () => {
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
    expect(await verifyPassword('x', 'bcrypt$1$2$3$a$b')).toBe(false);
  });

  it('dummy verification always fails', async () => {
    expect(await verifyAgainstDummy('anything')).toBe(false);
  });
});
