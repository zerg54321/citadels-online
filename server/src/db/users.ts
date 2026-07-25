import type { Avatar } from 'citadels-common';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './database';
import { nowIso } from '../utils/dateUtils';

// Re-export so existing `import { Avatar } from '../db/users'` callers
// (avatarRoutes, etc.) keep working without changing their import path.
export type { Avatar };

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  pwd_changed_at: string;
  avatar_type: string;
  avatar_ref: string;
  created_at: string;
  updated_at: string;
};

// avatar: type='preset' → ref is the preset id (e.g. '01'), rendered by the
// client as `/avatars/{ref}.png`; type='upload' → ref is the userId, served
// from the server's /api/avatar/{userId} static route. The client builds the
// URL from these two fields so no absolute URL is baked into the DB.
// (Avatar type itself is imported from citadels-common above.)

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  avatar: Avatar;
};

// PublicUser extended with the password-change timestamp so signAuthToken
// can stamp it into the JWT. The 4 auth flows that issue a token
// (createUser, verifyLogin, updateDisplayName, changePassword) return this;
// getPublicUser (used only for display, no token signing) stays PublicUser.
export type AuthPublicUser = PublicUser & { pwdChangedAt: string };

const BCRYPT_ROUNDS = 10;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function genUserId() {
  return randomBytes(16).toString('hex');
}

export function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatar: { type: user.avatar_type, ref: user.avatar_ref },
  };
}

function toAuthPublic(user: UserRecord): AuthPublicUser {
  return { ...toPublic(user), pwdChangedAt: user.pwd_changed_at };
}

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return 'username must be 3-32 chars: letters, numbers, underscore';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return 'password must be 6-72 characters';
  }
  return null;
}

export function validateDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 32) {
    return 'display name must be 1-32 characters';
  }
  return null;
}

export function findUserByUsername(username: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as
    | UserRecord
    | undefined;
}

export function findUserById(id: string): UserRecord | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRecord | undefined;
}

export function createUser(
  username: string,
  password: string,
  displayName?: string,
): { user?: AuthPublicUser; error?: string } {
  const usernameError = validateUsername(username);
  if (usernameError) return { error: usernameError };

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };

  const name = (displayName ?? username).trim();
  const displayError = validateDisplayName(name);
  if (displayError) return { error: displayError };

  if (findUserByUsername(username)) {
    return { error: 'username already taken' };
  }

  const id = genUserId();
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  const ts = nowIso();

  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, pwd_changed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, username, passwordHash, name, ts, ts, ts);
  } catch (err) {
    return { error: 'failed to create user' };
  }

  const user = findUserById(id);
  if (!user) return { error: 'failed to create user' };
  return { user: toAuthPublic(user) };
}

export function verifyLogin(
  username: string,
  password: string,
): { user?: AuthPublicUser; error?: string } {
  const user = findUserByUsername(username);
  if (!user) {
    return { error: 'invalid username or password' };
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { error: 'invalid username or password' };
  }
  return { user: toAuthPublic(user) };
}

export function updateDisplayName(
  userId: string,
  displayName: string,
): { user?: AuthPublicUser; error?: string } {
  const displayError = validateDisplayName(displayName);
  if (displayError) return { error: displayError };

  const user = findUserById(userId);
  if (!user) return { error: 'user not found' };

  const ts = nowIso();
  db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName.trim(), ts, userId);

  const updated = findUserById(userId);
  if (!updated) return { error: 'user not found' };
  return { user: toAuthPublic(updated) };
}

export function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): { user?: AuthPublicUser; error?: string } {
  const user = findUserById(userId);
  if (!user) return { error: 'user not found' };

  // Verify the current password before allowing a change.
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return { error: 'current password is incorrect' };
  }

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { error: passwordError };

  if (newPassword === currentPassword) {
    return { error: 'new password must be different from the current one' };
  }

  const passwordHash = bcrypt.hashSync(newPassword, BCRYPT_ROUNDS);
  const ts = nowIso();
  // Bump pwd_changed_at so previously-issued JWTs (which carry the older
  // pwdChangedAt claim) are rejected by authenticateToken on the next
  // request — i.e. changing the password invalidates all other sessions.
  db.prepare('UPDATE users SET password_hash = ?, pwd_changed_at = ?, updated_at = ? WHERE id = ?')
    .run(passwordHash, ts, ts, userId);

  const updated = findUserById(userId);
  if (!updated) return { error: 'user not found' };
  return { user: toAuthPublic(updated) };
}

export function getPublicUser(userId: string): PublicUser | undefined {
  const user = findUserById(userId);
  return user ? toPublic(user) : undefined;
}

// ── Avatar ──────────────────────────────────────────────────────────────

// Preset ids correspond to files in client-react/public/avatars/ (01.png..).
// Keep this list in sync with the actual files; the GET /api/avatar/presets
// route serves it to the client so the picker grid matches what's on disk.
export const PRESET_AVATARS = ['01', '02', '03', '04', '05', '06', '07',
  '08', '09', '10', '11', '12', '13', '14'];

export function isPresetAvatar(ref: string): boolean {
  return PRESET_AVATARS.includes(ref);
}

// Set the avatar to a preset (ref = preset id) or an upload (ref = userId).
// type/ref are validated by the caller (the route), not here.
export function updateAvatar(
  userId: string,
  type: string,
  ref: string,
): { user?: AuthPublicUser; error?: string } {
  const user = findUserById(userId);
  if (!user) return { error: 'user not found' };
  const ts = nowIso();
  db.prepare('UPDATE users SET avatar_type = ?, avatar_ref = ?, updated_at = ? WHERE id = ?')
    .run(type, ref, ts, userId);
  const updated = findUserById(userId);
  if (!updated) return { error: 'user not found' };
  return { user: toAuthPublic(updated) };
}
