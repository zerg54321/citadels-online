import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import history from 'connect-history-api-fallback';
import { initSocket } from './socket/server';
import { createAuthRouter } from './auth/routes';
import { createAvatarRouter } from './auth/avatarRoutes';
import { createStatsRouter } from './stats/routes';
import { createRoomsRouter } from './rooms/routes';
import { createAdminRouter } from './admin/routes';
import { dbPath } from './db/database';

const app = express();
const http = createServer(app);
const port = process.env.PORT || 8081;

app.enable('trust proxy');
app.use(express.json());

// Redirect to https. Only active when ENFORCE_HTTPS=1; behind a reverse proxy
// (Nginx/Caddy) TLS termination and the 80->443 redirect should be handled by
// the proxy, so this stays off by default to allow IP-only HTTP deploys.
const enforceHttps = process.env.ENFORCE_HTTPS === '1';
app.use((req, res, next) => {
  if (!enforceHttps || req.path.startsWith('/api')) {
    next();
    return;
  }
  if (req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1' && !req.secure) {
    res.redirect(`https://${req.hostname}${req.url}`);
  } else {
    next();
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', createAuthRouter());
app.use('/api/avatar', createAvatarRouter());
app.use('/api/stats', createStatsRouter());
app.use('/api/rooms', createRoomsRouter());

// Admin surface: always mounted; the router's requireAdmin gate is
// fail-closed (404 for every path) when ADMIN_TOKEN/ADMIN_ALLOW_IPS are
// unset, so a default deployment exposes nothing here. Mounting
// unconditionally also prevents the SPA history() fallback below from
// serving index.html for /api/admin/* paths.
app.use('/api/admin', createAdminRouter());

const io = new Server(http, {
  path: '/s/',
  cors: {
    // Production: CORS_ORIGIN may be a single origin or a comma-separated
    // list (e.g. "https://www.example.com,https://example.com") to cover both
    // the www and bare domains behind a reverse proxy. Falls back to a
    // localhost default for IP-only HTTP deploys.
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.CORS_ORIGIN || 'http://localhost:8081')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['http://localhost:3010', 'http://127.0.0.1:3010'],
    credentials: true,
  },
});
initSocket(io);

app.use(history());
app.use(express.static('../client-react/dist'));

http.listen(port, () => {
  console.log(`Citadels game server listening on http://localhost:${port}`);
  console.log(`Database: ${dbPath}`);
});
