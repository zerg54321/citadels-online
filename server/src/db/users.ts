import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import db from './database';
import { nowIso } from '../utils/dateUtils';

export type UserRecord = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
};

const BCRYPT_ROUNDS = 10;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

function genUserId() {
  return randomBytes(16).toString('hex');
}

function toPublic(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
  };
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
): { user?: PublicUser; error?: string } {
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
      INSERT INTO users (id, username, password_hash, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, username, passwordHash, name, ts, ts);
  } catch (err) {
    return { error: 'failed to create user' };
  }

  const user = findUserById(id);
  if (!user) return { error: 'failed to create user' };
  return { user: toPublic(user) };
}

export function verifyLogin(
  username: string,
  password: string,
): { user?: PublicUser; error?: string } {
  const user = findUserByUsername(username);
  if (!user) {
    return { error: 'invalid username or password' };
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return { error: 'invalid username or password' };
  }
  return { user: toPublic(user) };
}

export function updateDisplayName(
  userId: string,
  displayName: string,
): { user?: PublicUser; error?: string } {
  const displayError = validateDisplayName(displayName);
  if (displayError) return { error: displayError };

  const user = findUserById(userId);
  if (!user) return { error: 'user not found' };

  const ts = nowIso();
  db.prepare('UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?')
    .run(displayName.trim(), ts, userId);

  const updated = findUserById(userId);
  if (!updated) return { error: 'user not found' };
  return { user: toPublic(updated) };
}

export function getPublicUser(userId: string): PublicUser | undefined {
  const user = findUserById(userId);
  return user ? toPublic(user) : undefined;
}
