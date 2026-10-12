import { env } from './env';

export const AUTH_COOKIE = 'invorra_token';
export const JWT_EXPIRES_IN = '7d';
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const BCRYPT_ROUNDS = env.NODE_ENV === 'test' ? 4 : 12;
