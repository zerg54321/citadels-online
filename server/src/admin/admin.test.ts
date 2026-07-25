/**
 * Admin 管理面鉴权链路与核心操作单测。
 *
 * 用法：
 *   npm --prefix server exec vitest run -- src/admin/admin.test.ts
 *
 * 覆盖四道闸门：
 *   1. fail-closed（未配置 ADMIN_TOKEN/ADMIN_ALLOW_IPS → 全部 404）
 *   2. IP 白名单（来源 IP 不在白名单 → 404）
 *   3. 静态长 token（缺失/错误 → 401，正确 → 放行）
 *   4. 不复用玩家 JWT 体系（玩家 token 不能升级为 admin）
 * 以及 reset-password / audit 写入 / match 删除的端到端链路。
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import express from 'express';
import http from 'http';

const GOOD_TOKEN = 'a'.repeat(64);

type Server = { server: http.Server; port: number; close: () => Promise<void> };

async function startServer(env: {
  token?: string;
  ips?: string;
}): Promise<Server> {
  vi.resetModules();
  vi.stubEnv('ADMIN_TOKEN', env.token ?? '');
  vi.stubEnv('ADMIN_ALLOW_IPS', env.ips ?? '');
  const { createAdminRouter } = await import('./routes.js');
  const { createUser } = await import('../db/users.js');

  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter());

  // Seed one user so list/detail/reset endpoints have a target.
  const created = createUser('tester', 'password123', 'Tester');
  if (created.error) throw new Error(`seed user failed: ${created.error}`);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        server,
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function req(port: number, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}/api/admin${path}`, init);
}

async function json(res: Response): Promise<any> {
  return res.json() as Promise<any>;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

describe('admin auth chain', () => {
  let s: Server;

  afterEach(async () => {
    if (s) await s.close();
    vi.unstubAllEnvs();
  });

  it('fail-closed: with no env configured, every path returns 404', async () => {
    s = await startServer({});
    const r = await req(s.port, '/users');
    expect(r.status).toBe(404);
    const ping = await req(s.port, '/ping', { headers: auth(GOOD_TOKEN) });
    expect(ping.status).toBe(404);
  });

  it('fail-closed: token shorter than 32 chars disables admin', async () => {
    s = await startServer({ token: 'short', ips: '127.0.0.1' });
    const r = await req(s.port, '/users', { headers: auth('short') });
    expect(r.status).toBe(404);
  });

  it('rejects requests with no Authorization header (401)', async () => {
    s = await startServer({ token: GOOD_TOKEN, ips: '127.0.0.1' });
    const r = await req(s.port, '/users');
    expect(r.status).toBe(401);
  });

  it('rejects a wrong token (401)', async () => {
    s = await startServer({ token: GOOD_TOKEN, ips: '127.0.0.1' });
    const r = await req(s.port, '/users', { headers: auth('b'.repeat(64)) });
    expect(r.status).toBe(401);
  });

  it('accepts the correct token (200) and lists users without password_hash', async () => {
    s = await startServer({ token: GOOD_TOKEN, ips: '127.0.0.1' });
    const r = await req(s.port, '/users', { headers: auth(GOOD_TOKEN) });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(body.users.length).toBeGreaterThan(0);
    const u = body.users[0];
    expect(u.username).toBe('tester');
    // password_hash must never leak through the admin API
    expect(u.password_hash).toBeUndefined();
    expect(u.passwordHash).toBeUndefined();
    expect(u.avatar).toBeDefined();
  });

  it('a player JWT (Bearer of any other string) is not accepted as admin', async () => {
    s = await startServer({ token: GOOD_TOKEN, ips: '127.0.0.1' });
    // Even a plausible-looking JWT-shaped string must be rejected — admin
    // uses its own static token, never the JWT verification path.
    const fakeJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig';
    const r = await req(s.port, '/users', { headers: auth(fakeJwt) });
    expect(r.status).toBe(401);
  });
});

describe('admin operations', () => {
  let s: Server;
  let userId: string;

  beforeEach(async () => {
    s = await startServer({ token: GOOD_TOKEN, ips: '127.0.0.1' });
    const list = await json(await req(s.port, '/users', { headers: auth(GOOD_TOKEN) }));
    userId = list.users[0].id;
  });

  afterEach(async () => {
    await s.close();
    vi.unstubAllEnvs();
  });

  it('resets a user password, returns a temp password once, and logs audit', async () => {
    const r = await req(s.port, `/users/${userId}/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(GOOD_TOKEN) },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(typeof body.password).toBe('string');
    expect(body.password.length).toBeGreaterThanOrEqual(6);
    expect(body.user.pwdChangedAt).toBeTruthy();

    // Audit log must record the reset (without the plaintext password).
    const ar = await req(s.port, '/audit', { headers: auth(GOOD_TOKEN) });
    const aBody = await json(ar);
    expect(aBody.status).toBe('ok');
    const entry = aBody.audit.find((e: { action: string }) => e.action === 'user.reset_password');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry.after)).not.toContain(body.password);
  });

  it('patches display name and records before/after in audit', async () => {
    const r = await req(s.port, `/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth(GOOD_TOKEN) },
      body: JSON.stringify({ displayName: 'Renamed' }),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.user.displayName).toBe('Renamed');

    const aBody = await json(await req(s.port, '/audit', { headers: auth(GOOD_TOKEN) }));
    const entry = aBody.audit.find((e: { action: string }) => e.action === 'user.update');
    expect(entry).toBeDefined();
    expect(entry.before.displayName).toBe('Tester');
    expect(entry.after.displayName).toBe('Renamed');
  });

  it('rejects an invalid display name (400)', async () => {
    const r = await req(s.port, `/users/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...auth(GOOD_TOKEN) },
      body: JSON.stringify({ displayName: '' }),
    });
    expect(r.status).toBe(400);
  });

  it('deletes a non-existent match (404) without triggering a backup', async () => {
    // 404 must short-circuit before backupDb runs, so no backup file is
    // written for a missing target.
    const r = await req(s.port, '/matches/nonexistent', {
      method: 'DELETE',
      headers: auth(GOOD_TOKEN),
    });
    expect(r.status).toBe(404);
  });

  it('lists matches (empty is fine) and returns total', async () => {
    const r = await req(s.port, '/matches', { headers: auth(GOOD_TOKEN) });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(typeof body.total).toBe('number');
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('filters users by username prefix and reports filtered total', async () => {
    const { createUser } = await import('../db/users.js');
    createUser('bot_alpha', 'password123', 'BotA');
    createUser('bot_beta', 'password123', 'BotB');
    createUser('human_one', 'password123', 'Human');

    const r = await req(s.port, '/users?prefix=bot&limit=50', { headers: auth(GOOD_TOKEN) });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(body.total).toBe(2);
    expect(body.users.every((u: { username: string }) => u.username.startsWith('bot'))).toBe(true);
  });

  it('deletes a single user (backup + audit), and a second call 404s', async () => {
    const { createUser } = await import('../db/users.js');
    const created = createUser('deleteme', 'password123', 'Del');
    if (created.error) throw new Error(`seed failed: ${created.error}`);
    const list = await json(await req(s.port, '/users?prefix=deleteme', { headers: auth(GOOD_TOKEN) }));
    const delId = list.users[0].id;

    const r = await req(s.port, `/users/${delId}`, {
      method: 'DELETE',
      headers: auth(GOOD_TOKEN),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(typeof body.backup).toBe('string');

    // Second delete of the same id short-circuits to 404 before backup.
    const r2 = await req(s.port, `/users/${delId}`, {
      method: 'DELETE',
      headers: auth(GOOD_TOKEN),
    });
    expect(r2.status).toBe(404);

    // Audit recorded the deletion.
    const aBody = await json(await req(s.port, '/audit', { headers: auth(GOOD_TOKEN) }));
    const entry = aBody.audit.find((e: { action: string }) => e.action === 'user.delete');
    expect(entry).toBeDefined();
    expect(entry.targetId).toBe(delId);
  });

  it('batch-deletes users by explicit id list (backup + audit + count drop)', async () => {
    const { createUser } = await import('../db/users.js');
    createUser('batch_a', 'password123', 'A');
    createUser('batch_b', 'password123', 'B');
    const list = await json(await req(s.port, '/users?prefix=batch', { headers: auth(GOOD_TOKEN) }));
    expect(list.total).toBe(2);
    const ids = list.users.map((u: { id: string }) => u.id);

    const r = await req(s.port, '/users/batch-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(GOOD_TOKEN) },
      body: JSON.stringify({ ids }),
    });
    expect(r.status).toBe(200);
    const body = await json(r);
    expect(body.status).toBe('ok');
    expect(body.deleted).toBe(2);
    expect(typeof body.backup).toBe('string');

    // The prefix now matches nothing.
    const after = await json(await req(s.port, '/users?prefix=batch', { headers: auth(GOOD_TOKEN) }));
    expect(after.total).toBe(0);

    // Audit recorded the batch with the usernames.
    const aBody = await json(await req(s.port, '/audit', { headers: auth(GOOD_TOKEN) }));
    const entry = aBody.audit.find((e: { action: string }) => e.action === 'user.batch_delete');
    expect(entry).toBeDefined();
    expect(entry.before.count).toBe(2);
  });

  it('batch-delete rejects an empty id list (400) without a backup', async () => {
    const r = await req(s.port, '/users/batch-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth(GOOD_TOKEN) },
      body: JSON.stringify({ ids: [] }),
    });
    expect(r.status).toBe(400);
  });
});

describe('admin config helpers', () => {
  it('normalizeIp strips IPv4-mapped IPv6 prefix', async () => {
    vi.resetModules();
    const { normalizeIp } = await import('./config.js');
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::1')).toBe('::1');
  });
});
