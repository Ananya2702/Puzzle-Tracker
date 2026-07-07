import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

const PYTHON_BCRYPT_HASH = '$2b$12$H53/OOxNApk9fX2agF.D.OsupkbtSPicmxa3spA/4y9j3yqWz60ti';

describe('password', () => {
  it('verifies a hash produced by the Flask app (python bcrypt, $2b$)', async () => {
    expect(await verifyPassword('legacy-pass-123', PYTHON_BCRYPT_HASH)).toBe(true);
    expect(await verifyPassword('wrong', PYTHON_BCRYPT_HASH)).toBe(false);
  });

  it('round-trips its own hashes', async () => {
    const h = await hashPassword('new-pass-456');
    expect(h.startsWith('$2')).toBe(true);
    expect(await verifyPassword('new-pass-456', h)).toBe(true);
    expect(await verifyPassword('nope', h)).toBe(false);
  });
});
