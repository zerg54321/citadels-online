import { Router, Request, Response, NextFunction } from 'express';
import {
  createUser,
  getPublicUser,
  updateDisplayName,
  verifyLogin,
} from '../db/users';
import {
  extractBearerToken,
  signAuthToken,
  verifyAuthToken,
} from './jwt';

export type AuthedRequest = Request & {
  userId?: string;
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.header('authorization'));
  if (!token) {
    res.status(401).json({ status: 'error', message: 'authentication required' });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ status: 'error', message: 'invalid or expired token' });
    return;
  }
  req.userId = payload.sub;
  next();
}

export function createAuthRouter(): Router {
  const router = Router();

  router.post('/register', (req: Request, res: Response) => {
    const { username, password, displayName } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ status: 'error', message: 'username and password are required' });
      return;
    }
    const result = createUser(
      username.trim(),
      password,
      typeof displayName === 'string' ? displayName : undefined,
    );
    if (result.error || !result.user) {
      res.status(400).json({ status: 'error', message: result.error || 'register failed' });
      return;
    }
    const token = signAuthToken(result.user);
    res.status(201).json({ status: 'ok', token, user: result.user });
  });

  router.post('/login', (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ status: 'error', message: 'username and password are required' });
      return;
    }
    const result = verifyLogin(username.trim(), password);
    if (result.error || !result.user) {
      res.status(401).json({ status: 'error', message: result.error || 'login failed' });
      return;
    }
    const token = signAuthToken(result.user);
    res.json({ status: 'ok', token, user: result.user });
  });

  router.get('/me', requireAuth, (req: AuthedRequest, res: Response) => {
    const user = getPublicUser(req.userId!);
    if (!user) {
      res.status(401).json({ status: 'error', message: 'user not found' });
      return;
    }
    res.json({ status: 'ok', user });
  });

  router.patch('/me', requireAuth, (req: AuthedRequest, res: Response) => {
    const { displayName } = req.body || {};
    if (typeof displayName !== 'string') {
      res.status(400).json({ status: 'error', message: 'displayName is required' });
      return;
    }
    const result = updateDisplayName(req.userId!, displayName);
    if (result.error || !result.user) {
      res.status(400).json({ status: 'error', message: result.error || 'update failed' });
      return;
    }
    const token = signAuthToken(result.user);
    res.json({ status: 'ok', token, user: result.user });
  });

  return router;
}
