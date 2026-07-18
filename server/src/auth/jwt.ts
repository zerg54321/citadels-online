import jwt from 'jsonwebtoken';
import { PublicUser } from '../db/users';

export type AuthTokenPayload = {
  sub: string;
  username: string;
  displayName: string;
};

const DEFAULT_DEV_SECRET = 'citadels-dev-secret-change-me';

function getSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
}

export function signAuthToken(user: PublicUser): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
  };
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded !== 'object' || decoded === null || !('sub' in decoded)) {
      return null;
    }
    const payload = decoded as jwt.JwtPayload;
    if (!payload.sub || typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      username: typeof payload.username === 'string' ? payload.username : '',
      displayName: typeof payload.displayName === 'string' ? payload.displayName : '',
    };
  } catch {
    return null;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
