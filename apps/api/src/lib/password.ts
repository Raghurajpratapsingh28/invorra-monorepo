import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../config/auth';

let dummyHash: string | null = null;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string | null): Promise<boolean> {
  if (!passwordHash) {
    if (!dummyHash) {
      dummyHash = await bcrypt.hash('invalid-password-placeholder', BCRYPT_ROUNDS);
    }
    await bcrypt.compare(password, dummyHash);
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}
