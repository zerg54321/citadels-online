// Avatar URL builder — shared by header, seat panel, profile modal, etc.
// The server stores only { type, ref }; the client resolves it to a URL:
//   preset  → /avatars/{ref}.png        (served from client-react/public/avatars)
//   upload  → /api/avatar/{ref}         (ref = userId; served by the server)
//   unknown → empty string (caller falls back to a default avatar)
//
// A cache-busting query is NOT added here: preset URLs are immutable, and
// uploads overwrite the same {userId}.webp so we rely on the server's short
// Cache-Control (max-age=60) rather than a per-render query string, which
// would defeat caching entirely.

import type { Avatar } from 'citadels-common';
import type { AuthUser } from '../store/authSlice';

export type { Avatar };

export function avatarUrl(avatar: Avatar | undefined | null): string {
  if (!avatar || !avatar.ref) return '';
  if (avatar.type === 'preset') return `/avatars/${avatar.ref}.png`;
  if (avatar.type === 'upload') return `/api/avatar/${avatar.ref}`;
  return '';
}

// Convenience: resolve a user's avatar, falling back to the first preset
// when the account predates the avatar columns (defensive — the server
// backfills 'preset'/'01' for everyone, but a stale localStorage authUser
// from before this deploy may lack the field).
export function userAvatarUrl(user: Pick<AuthUser, 'avatar'> | null | undefined): string {
  if (user?.avatar) return avatarUrl(user.avatar);
  return '/avatars/01.png';
}
