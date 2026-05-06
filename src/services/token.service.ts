import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface TokenPayload {
  sub: string;
  role: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role, type: 'access' } satisfies TokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

export function signRefreshToken(userId: string, role: string): string {
  return jwt.sign(
    { sub: userId, role, type: 'refresh' } satisfies TokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
  );
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}
