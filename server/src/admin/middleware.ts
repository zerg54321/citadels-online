import {
  Request,
  Response,
  NextFunction,
} from 'express';
import crypto from 'crypto';
import {
  adminEnabled,
  adminToken,
  ipAllowed,
} from './config';

// Constant-time string compare to avoid timing oracle on the admin token.
// Both arguments are hashed to fixed length first so length differences do
// not leak via compare timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Single gate combining the four defenses:
//   1. fail-closed: admin disabled by default → 404 (looks like no endpoint)
//   2. IP allowlist on the *actual TCP peer* (req.socket.remoteAddress),
//      unspoofable by X-Forwarded-For → 404 on mismatch
//   3. static long bearer token, constant-time compared → 401 on mismatch
//   4. nothing about the user/JWT system is consulted, so a compromised
//      player session can never escalate to admin
// The peer IP is read again by route handlers directly from req.socket for
// audit logging (no request mutation needed).
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!adminEnabled()) {
    res.status(404).json({ status: 'error', message: 'not found' });
    return;
  }

  const peer = req.socket.remoteAddress;
  if (!ipAllowed(peer)) {
    res.status(404).json({ status: 'error', message: 'not found' });
    return;
  }

  const header = req.header('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const presented = match ? match[1] : '';
  if (!safeEqual(presented, adminToken)) {
    res.status(401).json({ status: 'error', message: 'invalid admin credentials' });
    return;
  }

  next();
}

// Read the audited peer IP from the actual socket (same source the gate
// checked). Centralized so handlers don't repeat the fallback logic.
export function adminIpFrom(req: Request): string {
  return req.socket.remoteAddress || 'unknown';
}
