import jwt from 'jsonwebtoken';
import {
  findUserById,
  toPublic,
  type AuthPublicUser,
  type PublicUser,
} from '../db/users';

export type AuthTokenPayload = {
  sub: string;
  username: string;
  displayName: string;
  pwdChangedAt?: string;
};

const DEFAULT_DEV_SECRET = 'citadels-dev-secret-change-me';

function getSecret(): string {
  return process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
}

export function signAuthToken(user: AuthPublicUser): string {
  const payload: AuthTokenPayload = {
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    // Stamp the current password-change timestamp into the token so
    // authenticateToken can reject tokens issued before a password change.
    pwdChangedAt: user.pwdChangedAt,
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
      pwdChangedAt: typeof payload.pwdChangedAt === 'string' ? payload.pwdChangedAt : undefined,
    };
  } catch {
    return null;
  }
}

// Verify the token signature AND enforce password-change invalidation in one
// step. Shared by HTTP requireAuth and the socket attachAuth handshake so the
// rule is applied uniformly. Returns the public user on success, null on any
// failure (bad token, unknown user, or a pwdChangedAt mismatch meaning the
// password was changed after this token was issued).
export function authenticateToken(token: string): PublicUser | null {
  const payload = verifyAuthToken(token);
  if (!payload) return null;
  const user = findUserById(payload.sub);
  if (!user) return null;
  // Strict check: the DB's pwd_changed_at is non-empty for every user
  // (backfilled to created_at on deploy). A token must carry a matching
  // pwdChangedAt claim. Tokens issued before this deploy (no claim) and
  // tokens issued before a password change (stale claim) are rejected.
  if (!payload.pwdChangedAt || payload.pwdChangedAt !== user.pwd_changed_at) {
    return null;
  }
  return toPublic(user);
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
